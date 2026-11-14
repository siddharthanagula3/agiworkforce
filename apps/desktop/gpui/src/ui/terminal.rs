use super::*;
use crate::terminal_view::{TerminalInputKind, TerminalView, TerminalViewEvent};
use agiworkforce_protocol::{developer_session::DeveloperWorkspaceIdentity, workspace_terminal::*};

impl Desktop {
    pub(super) fn open_terminal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.loading
            || !self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.workspace_terminal)
        {
            return;
        }
        self.terminal.visible = true;
        self.code_settings.visible = false;
        self.code_worktrees.visible = false;
        self.editor.visible = false;
        self.changes.visible = false;
        self.cloud.visible = false;
        self.account.visible = false;
        self.models = None;
        self.history_viewport.older();
        if self.terminal.root.is_some() {
            self.watch_terminal(window, cx);
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.terminal.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.terminal.begin();
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<DeveloperWorkspaceIdentity>(
                    method::WORKSPACE_IDENTITY,
                    serde_json::json!({}),
                )
                .await
        });
        cx.spawn_in(window, async move |view, cx| {
            let result = task
                .await
                .context("Opening the terminal scope stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.terminal.operation != Some(operation) {
                    return;
                }
                view.terminal.operation = None;
                match result {
                    Ok(root) if !root.root_key.is_empty() => {
                        view.terminal.root = Some(root);
                        view.watch_terminal(window, cx);
                    }
                    Ok(_) => {
                        view.terminal.error =
                            Some("The runtime returned no coding folder identity".into())
                    }
                    Err(error) => view.terminal.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    pub(super) fn watch_terminal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.terminal.visible || self.terminal.root.is_none() {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.terminal.error = Some(error.to_string());
                self.terminal.read_failed = true;
                cx.notify();
                return;
            }
        };
        self.terminal_poll_task = None;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal.read_failed = true;
        let epoch = self.terminal.epoch;
        let generation = self.generation;
        let interval = self.settings.terminal_poll_interval_ms;
        self.terminal_poll_task = Some(cx.spawn_in(window, async move |view, cx| loop {
            let params = view.read_with(cx, |view, _| {
                if view.generation != generation
                    || view.terminal.epoch != epoch
                    || !view.terminal.visible
                {
                    return None;
                }
                let root = view.terminal.root.as_ref()?;
                let read = view
                    .terminal
                    .selected
                    .as_ref()
                    .map(|id| TerminalReadParams {
                        root_key: root.root_key.clone(),
                        terminal_id: id.clone(),
                        scrollback: view.terminal.scrollback,
                        after_revision: view
                            .terminal
                            .frame
                            .as_ref()
                            .map(|frame| frame.terminal.revision),
                    });
                Some((
                    TerminalListParams {
                        root_key: root.root_key.clone(),
                    },
                    read,
                ))
            });
            let Ok(Some((list, read))) = params else {
                return;
            };
            let poll_client = client.clone();
            let requested = read.clone();
            let task = match view.update(cx, |view, _| {
                view.executor.spawn(async move {
                    let frame = if let Some(read) = read {
                        Some(
                            poll_client
                                .request::<TerminalReadResponse>(method::TERMINAL_READ, read)
                                .await?,
                        )
                    } else {
                        None
                    };
                    let list = poll_client
                        .request::<TerminalListResponse>(method::TERMINAL_LIST, list)
                        .await?;
                    Ok::<_, agiworkforce_app_server::DeveloperSessionClientError>((list, frame))
                })
            }) {
                Ok(task) => task,
                Err(_) => return,
            };
            let result = task
                .await
                .context("Refreshing terminal output stopped")
                .and_then(|result| result.map_err(Into::into));
            let applied = view.update_in(cx, |view, window, cx| {
                if view.generation != generation || view.terminal.epoch != epoch {
                    return false;
                }
                let result = result.and_then(|(list, frame)| {
                    view.terminal.accept_list(list)?;
                    if let (Some(params), Some(frame)) = (requested.as_ref(), frame) {
                        if view.terminal.selected.as_deref() == Some(params.terminal_id.as_str()) {
                            view.terminal.accept_frame(params, frame)?;
                        }
                    }
                    if view.terminal.selected.is_none() {
                        view.terminal.selected = view
                            .terminal
                            .terminals
                            .first()
                            .map(|terminal| terminal.plan.terminal_id.clone());
                        view.terminal.frame = None;
                    }
                    Ok(())
                });
                match result {
                    Ok(()) => {
                        view.terminal.read_failed = false;
                        view.sync_terminal_view(window, cx);
                    }
                    Err(error) => {
                        view.terminal.read_failed = true;
                        view.terminal.error =
                            Some(format!("Terminal output could not be refreshed: {error:#}"));
                        cx.notify();
                        return false;
                    }
                }
                cx.notify();
                true
            });
            if !matches!(applied, Ok(true)) {
                return;
            }
            cx.background_executor()
                .timer(std::time::Duration::from_millis(interval))
                .await;
        }));
        cx.notify();
    }
    pub(super) fn new_terminal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.terminal.operation.is_some() {
            return;
        }
        let Some(root) = self.terminal.root.clone() else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.terminal.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.terminal.begin();
        let generation = self.generation;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        let params = TerminalPlanParams {
            root_key: root.root_key.clone(),
            size: TerminalSize {
                rows: DEFAULT_TERMINAL_ROWS,
                columns: DEFAULT_TERMINAL_COLUMNS,
            },
        };
        cx.spawn_in(window,async move|view,cx|{
            let result:Result<Option<TerminalSummary>>=async{
                let plan_client=client.clone();let task=view.update(cx,|view,_|view.executor.spawn(async move{plan_client.request::<TerminalPlan>(method::TERMINAL_PLAN,params).await}))?;
                let plan=task.await.context("Reviewing the terminal launch stopped")??;
                anyhow::ensure!(plan.root_key==root.root_key&&plan.size.valid()&&uuid::Uuid::parse_str(&plan.terminal_id).is_ok(),"The runtime returned a different terminal launch scope");
                let detail=format!("Folder: {}\nShell: {}\nSandbox: {}\nNetwork: {}\n\nThe shell and commands you type use this runtime policy. Shell startup code may run. Terminal input stays outside the agent conversation and its tool approval flow. Closing this runtime stops its terminal jobs. Input or connection failures may stop a terminal.",plan.cwd,plan.shell,plan.sandbox,if plan.network_allowed{"Allowed"}else{"Denied"});
                let prompt=cx.update(|window,cx|window.prompt(PromptLevel::Warning,"Open this interactive terminal?",Some(&detail),&["Keep closed","Open terminal"],cx))?;
                let id=TerminalIdParams{root_key:plan.root_key.clone(),terminal_id:plan.terminal_id.clone()};
                if prompt.await?!=1{let cancel=client.clone();let task=view.update(cx,|view,_|view.executor.spawn(async move{cancel.request::<TerminalSummary>(method::TERMINAL_CLOSE,id).await}))?;let _=task.await;return Ok(None);}
                view.update(cx,|view,_|{anyhow::ensure!(view.generation==generation&&view.terminal.operation==Some(operation),"The runtime changed during terminal launch review");view.terminal.pending_start=Some(plan);Ok::<_,anyhow::Error>(())})??;
                let task=view.update(cx,|view,_|view.executor.spawn(async move{client.request::<TerminalSummary>(method::TERMINAL_START,id).await}))?;
                Ok(Some(task.await.context("Terminal acceptance could not be confirmed")??))
            }.await;
            let _=view.update_in(cx,|view,window,cx|{if view.generation!=generation||view.terminal.operation!=Some(operation){return;}view.terminal.operation=None;
                let result=result.and_then(|summary|{if let Some(summary)=summary{let id=summary.plan.terminal_id.clone();view.terminal.merge_summary(summary)?;view.terminal.pending_start=None;view.terminal.selected=Some(id);view.terminal.frame=None;view.terminal.scrollback=0;view.terminal_view=None;}Ok(())});
                if let Err(error)=result{view.terminal.error=Some(format!("The terminal launch was not confirmed: {error:#}"));}view.watch_terminal(window,cx);cx.notify();});
        }).detach();
        cx.notify();
    }
    fn sync_terminal_view(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(frame) = &self.terminal.frame else {
            return;
        };
        let Some(screen) = &frame.screen else {
            return;
        };
        let id = frame.terminal.plan.terminal_id.clone();
        let revision = frame.terminal.revision;
        let running = self.terminal.current().is_some_and(|summary| {
            summary.state == TerminalState::Running && summary.error.is_none()
        });
        let enabled = running
            && self.terminal.visible
            && !self.terminal.read_failed
            && (self.terminal.operation.is_none() || self.terminal.resizing)
            && !self.terminal.paused.contains(&id)
            && self.pending_terminal_paste.is_none()
            && !self.closing;
        let dark = matches!(
            window.appearance(),
            WindowAppearance::Dark | WindowAppearance::VibrantDark
        );
        let palette = if dark {
            self.contracts.dark
        } else {
            self.contracts.light
        };
        if self
            .terminal_view
            .as_ref()
            .is_none_or(|view| view.read(cx).terminal_id != id)
        {
            let contracts = self.contracts.clone();
            let screen = screen.clone();
            let view = cx.new(|cx| {
                let mut view = TerminalView::new(id, screen, contracts, palette, dark, cx);
                view.revision = revision;
                view.enabled = enabled;
                view.running = running;
                view
            });
            cx.subscribe_in(
                &view,
                window,
                |desktop: &mut Desktop, _, event: &TerminalViewEvent, window, cx| {
                    desktop.terminal_event(event.clone(), window, cx)
                },
            )
            .detach();
            self.terminal_view = Some(view.clone());
            view.update(cx, |view, cx| view.focus(window, cx));
        } else if let Some(view) = &self.terminal_view {
            view.update(cx, |view, cx| {
                let mut changed = view.set_theme(palette, dark);
                if view.revision != revision
                    || view.screen.scrollback != screen.scrollback
                    || view.screen.size != screen.size
                {
                    view.screen = screen.clone();
                    view.revision = revision;
                    changed = true;
                }
                changed |= view.enabled != enabled || view.running != running;
                view.enabled = enabled;
                view.running = running;
                if changed {
                    cx.notify();
                }
            });
        }
    }
    fn terminal_event(
        &mut self,
        event: TerminalViewEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.terminal.visible || self.terminal.selected.as_ref() != Some(&event.terminal_id) {
            return;
        }
        match event.kind {
            TerminalInputKind::Resize(size) => self.resize_terminal(size, cx),
            TerminalInputKind::Copy => self.copy_terminal(cx),
            TerminalInputKind::Paste => self.paste_terminal(None, window, cx),
            TerminalInputKind::Rejected(error) => {
                self.terminal.error = Some(error);
                cx.notify();
            }
            TerminalInputKind::Text(text) => {
                if text.contains(['\n', '\r']) {
                    self.paste_terminal(Some(text), window, cx);
                } else {
                    match crate::terminal::encode_paste(&text, false) {
                        Ok(text) => self.send_terminal_text(text, cx),
                        Err(error) => {
                            self.terminal.error = Some(error.to_string());
                            cx.notify();
                        }
                    }
                }
            }
            TerminalInputKind::Key(text) => self.send_terminal_text(text, cx),
        }
    }
    fn send_terminal_text(&mut self, text: String, cx: &mut Context<Self>) {
        if self.terminal.read_failed
            || self.pending_terminal_paste.is_some()
            || (self.terminal.operation.is_some() && !self.terminal.resizing)
        {
            self.terminal.error =
                Some("Wait for the terminal view or review to finish before typing.".into());
            cx.notify();
            return;
        }
        let result = self
            .terminal
            .owned_id()
            .and_then(|id| self.terminal.enqueue(id, text));
        if let Err(error) = result {
            self.terminal.error = Some(error.to_string());
            cx.notify();
            return;
        }
        if self.terminal.scrollback != 0 {
            self.terminal.scrollback = 0;
            self.terminal.frame = None;
        }
        self.drain_terminal_input(cx);
    }
    fn drain_terminal_input(&mut self, cx: &mut Context<Self>) {
        if self.terminal.sending {
            return;
        }
        let Some(params) = self.terminal.next_input() else {
            return;
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.terminal.pause(&params.terminal_id);
                self.terminal.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.terminal.sending = true;
        let generation = self.generation;
        let sent = params.clone();
        let id = params.terminal_id.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<TerminalSummary>(method::TERMINAL_WRITE, sent)
                .await
        });
        cx.spawn(async move|view,cx|{let result=task.await.context("Terminal input delivery stopped").and_then(|result|result.map_err(Into::into));let _=view.update(cx,|view,cx|{if view.generation!=generation{return;}view.terminal.sending=false;
            let result=result.and_then(|summary|{anyhow::ensure!(summary.plan.root_key==params.root_key&&summary.plan.terminal_id==id&&params.sequence.checked_add(1)==Some(summary.next_input_sequence),"The terminal did not acknowledge the exact input sequence");if view.terminal.terminals.iter().any(|terminal|terminal.plan.terminal_id==id){view.terminal.merge_summary(summary)?;}Ok(())});
            if let Err(error)=result{view.terminal.pause(&id);view.terminal.error=Some(format!("Input in terminal {id} could not be confirmed. Close it before typing again. {error:#}"));}view.drain_terminal_input(cx);cx.notify();});}).detach();
    }
    pub(super) fn resize_terminal(&mut self, size: TerminalSize, cx: &mut Context<Self>) {
        if self.terminal.operation.is_some() {
            if let Some(view) = &self.terminal_view {
                view.update(cx, |view, _| view.retry_size());
            }
            return;
        }
        let Ok(id) = self.terminal.owned_id() else {
            return;
        };
        if self
            .terminal
            .current()
            .is_none_or(|summary| summary.state != TerminalState::Running)
        {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.terminal.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let params = TerminalResizeParams {
            root_key: id.root_key,
            terminal_id: id.terminal_id.clone(),
            size,
        };
        let generation = self.generation;
        let operation = self.terminal.begin();
        self.terminal.resizing = true;
        let task = self.executor.spawn(async move {
            client
                .request::<TerminalSummary>(method::TERMINAL_RESIZE, params)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Resizing the terminal stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.terminal.operation != Some(operation) {
                    return;
                }
                view.terminal.operation = None;
                view.terminal.resizing = false;
                if let Err(error) = result.and_then(|summary| {
                    anyhow::ensure!(
                        summary.plan.terminal_id == id.terminal_id && summary.plan.size == size,
                        "The terminal resize returned a different session or size"
                    );
                    view.terminal.merge_summary(summary)
                }) {
                    view.terminal.error = Some(error.to_string());
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    pub(super) fn close_terminal(
        &mut self,
        id: TerminalIdParams,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.terminal.operation.is_some() && !self.terminal.resizing {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.terminal.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = self.terminal.begin();
        let generation = self.generation;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        cx.spawn_in(window,async move|view,cx|{let result:Result<bool>=async{
            let prompt=cx.update(|window,cx|window.prompt(PromptLevel::Warning,"Close this terminal and its jobs?",Some("This cancels a pending launch or stops the shell and its session-owned jobs. Unsaved work inside terminal programs and this terminal's scrollback will be lost. File edits already saved remain."),&["Keep terminal","Close terminal"],cx))?;
            if prompt.await?!=1{return Ok(false);}view.update(cx,|view,_|view.terminal.pause(&id.terminal_id))?;
            let close_id=id.clone();let task=view.update(cx,|view,_|view.executor.spawn(async move{client.request::<TerminalSummary>(method::TERMINAL_CLOSE,close_id).await}))?;
            let summary=task.await.context("Closing the terminal stopped")??;anyhow::ensure!(summary.plan.root_key==id.root_key&&summary.plan.terminal_id==id.terminal_id&&matches!(summary.state,TerminalState::Stopped|TerminalState::Exited),"The terminal process session was not confirmed closed");Ok(true)
        }.await;
        let _=view.update_in(cx,|view,window,cx|{
            if view.generation!=generation||view.terminal.operation!=Some(operation){return;}
            view.terminal.operation=None;
            match result{
                Ok(true)=>{
                    view.terminal.terminals.retain(|terminal|terminal.plan.terminal_id!=id.terminal_id);
                    if view.terminal.pending_start.as_ref().is_some_and(|plan|plan.terminal_id==id.terminal_id){view.terminal.pending_start=None;}
                    if view.terminal.selected.as_ref()==Some(&id.terminal_id){view.terminal.selected=None;view.terminal.frame=None;view.terminal_view=None;}
                },
                Ok(false)=>{},
                Err(error)=>view.terminal.error=Some(format!("Terminal shutdown could not be confirmed: {error:#}")),
            }
            view.watch_terminal(window,cx);cx.notify();
        });}).detach();
        cx.notify();
    }
    pub(super) fn copy_terminal(&mut self, cx: &mut Context<Self>) {
        let Some(screen) = self
            .terminal
            .frame
            .as_ref()
            .and_then(|frame| frame.screen.as_ref())
        else {
            return;
        };
        let text = screen
            .cells
            .iter()
            .map(|row| crate::terminal::row_text(row))
            .collect::<Vec<_>>()
            .join("\n");
        cx.write_to_clipboard(gpui::ClipboardItem::new_string(text));
    }
    pub(super) fn paste_terminal(
        &mut self,
        text: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Ok(id) = self.terminal.owned_id() else {
            return;
        };
        let Some(screen) = self
            .terminal
            .frame
            .as_ref()
            .and_then(|frame| frame.screen.as_ref())
        else {
            return;
        };
        let text = text.or_else(|| cx.read_from_clipboard().and_then(|item| item.text()));
        let Some(text) = text else {
            self.terminal.error = Some("The clipboard has no text".into());
            cx.notify();
            return;
        };
        match crate::terminal::encode_paste(&text, screen.bracketed_paste) {
            Ok(encoded) => {
                if text.contains(['\n', '\r']) {
                    self.terminal_paste.update(cx, |state, cx| {
                        state.set_value(text.clone(), window, cx);
                        state.focus(window, cx);
                    });
                    self.pending_terminal_paste = Some((id, text));
                } else {
                    self.send_terminal_text(encoded, cx);
                }
            }
            Err(error) => self.terminal.error = Some(error.to_string()),
        }
        cx.notify();
    }
    pub(super) fn confirm_terminal_paste(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some((id, text)) = self.pending_terminal_paste.clone() else {
            return;
        };
        if self.terminal.operation.is_some() {
            return;
        }
        let operation = self.terminal.begin();
        let generation = self.generation;
        cx.spawn_in(window,async move|view,cx|{let result:Result<bool>=async{let prompt=cx.update(|window,cx|window.prompt(PromptLevel::Warning,"Paste these lines into the terminal?",Some("The complete text is shown in the paste review. Pasted newlines may execute shell commands. Keep the terminal open while they run."),&["Keep reviewing","Paste lines"],cx))?;Ok(prompt.await?==1)}.await;
            let _=view.update(cx,|view,cx|{if view.generation!=generation||view.terminal.operation!=Some(operation){return;}view.terminal.operation=None;
                let result=result.and_then(|accepted|{if accepted{anyhow::ensure!(view.terminal.owned_id()?==id&&view.terminal_paste.read(cx).value().as_str()==text,"The terminal or paste review changed");let bracketed=view.terminal.frame.as_ref().and_then(|frame|frame.screen.as_ref()).context("The terminal screen is unavailable")?.bracketed_paste;let encoded=crate::terminal::encode_paste(&text,bracketed)?;view.pending_terminal_paste=None;view.send_terminal_text(encoded,cx);}Ok(())});if let Err(error)=result{view.terminal.error=Some(error.to_string());}cx.notify();});}).detach();
        cx.notify();
    }
    pub(super) fn render_terminal(
        &mut self,
        palette: Palette,
        dark: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        self.sync_terminal_view(window, cx);
        if let Some(view) = &self.terminal_view {
            view.update(cx, |view, _| {
                view.set_theme(palette, dark);
            });
        }
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3();
        panel = panel.child(self.button(
            "back-from-terminal",
            "Back to conversation",
            UiAction::BackFromTerminal,
            palette,
            cx,
        ));
        if let Some(error) = &self.terminal.error {
            panel = panel.child(
                div()
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if self.terminal.operation.is_none() && self.terminal.root.is_some() {
            panel = panel
                .child(self.button(
                    "new-terminal",
                    "New terminal…",
                    UiAction::NewTerminal,
                    palette,
                    cx,
                ))
                .child(self.button(
                    "refresh-terminals",
                    "Refresh terminals",
                    UiAction::RefreshTerminals,
                    palette,
                    cx,
                ));
        }
        if self.terminal.operation.is_none() && self.terminal.root.is_none() {
            panel = panel.child(self.button(
                "retry-terminal",
                "Retry terminal",
                UiAction::Terminal,
                palette,
                cx,
            ));
        }
        for (index, terminal) in self.terminal.terminals.iter().enumerate() {
            if self.terminal.operation.is_some() && !self.terminal.resizing {
                panel = panel.child(gpui::text!(
                    id = SharedString::from(format!(
                        "terminal-loading-tab:{}",
                        terminal.plan.terminal_id
                    )),
                    format!("Terminal {} · {:?}", index + 1, terminal.state)
                ));
                continue;
            }
            panel = panel.child(self.button(
                SharedString::from(format!("terminal-tab:{}", terminal.plan.terminal_id)),
                format!("Terminal {} · {:?}", index + 1, terminal.state),
                UiAction::SelectTerminal(terminal.plan.terminal_id.clone()),
                palette,
                cx,
            ));
        }
        if let Some(plan) = &self.terminal.pending_start {
            panel = panel.child(gpui::text!(
                "A terminal launch has not been confirmed. Close it to cancel or stop its jobs."
            ));
            if self.terminal.operation.is_none() {
                panel = panel.child(self.button(
                    "cancel-terminal-launch",
                    "Close unconfirmed terminal…",
                    UiAction::CloseTerminal(TerminalIdParams {
                        root_key: plan.root_key.clone(),
                        terminal_id: plan.terminal_id.clone(),
                    }),
                    palette,
                    cx,
                ));
            }
        }
        if let Some(current) = self.terminal.current() {
            panel = panel.child(gpui::text!(format!(
                "{} · {} · {} · Network {}",
                current.plan.cwd,
                current.plan.shell,
                current.plan.sandbox,
                if current.plan.network_allowed {
                    "allowed"
                } else {
                    "denied"
                }
            )));
            if let Some(error) = &current.error {
                panel = panel.child(gpui::text!(error.clone()));
            }
            if self.terminal.paused.contains(&current.plan.terminal_id) {
                panel=panel.child(gpui::text!("Typing is paused after input could not be confirmed. Close this terminal before continuing."));
            }
            if self.terminal.operation.is_none() || self.terminal.resizing {
                panel = panel.child(self.button(
                    "close-terminal",
                    "Close terminal…",
                    UiAction::CloseTerminal(TerminalIdParams {
                        root_key: current.plan.root_key.clone(),
                        terminal_id: current.plan.terminal_id.clone(),
                    }),
                    palette,
                    cx,
                ));
            }
            if self
                .terminal
                .frame
                .as_ref()
                .is_some_and(|frame| frame.screen.is_some())
            {
                panel = panel.child(self.button(
                    "copy-terminal",
                    "Copy screen",
                    UiAction::CopyTerminal,
                    palette,
                    cx,
                ));
                if current.state == TerminalState::Running
                    && !self.terminal.read_failed
                    && self.terminal.operation.is_none()
                    && !self.terminal.paused.contains(&current.plan.terminal_id)
                {
                    panel = panel
                        .child(self.button(
                            "paste-terminal",
                            "Paste text…",
                            UiAction::PasteTerminal,
                            palette,
                            cx,
                        ))
                        .child(self.button(
                            "fit-terminal",
                            "Fit terminal",
                            UiAction::FitTerminal,
                            palette,
                            cx,
                        ));
                }
                if let Some(screen) = self
                    .terminal
                    .frame
                    .as_ref()
                    .and_then(|frame| frame.screen.as_ref())
                {
                    if screen.scrollback_len > screen.scrollback {
                        panel = panel.child(self.button(
                            "older-terminal-output",
                            "Earlier output",
                            UiAction::ScrollTerminal(true),
                            palette,
                            cx,
                        ));
                    }
                    if screen.scrollback > 0 {
                        panel = panel.child(self.button(
                            "latest-terminal-output",
                            "Latest output",
                            UiAction::ScrollTerminal(false),
                            palette,
                            cx,
                        ));
                    }
                }
            }
        } else if self.terminal.operation.is_none() {
            panel=panel.child(gpui::text!("No terminal is selected. New terminal opens a reviewed interactive shell in this coding folder."));
        }
        if self.pending_terminal_paste.is_some() {
            panel = panel.child(gpui::text!(
                "Review the complete text to paste. Newlines may execute commands."
            ));
            panel = panel.child(
                Textarea::new(&self.terminal_paste)
                    .readonly(true)
                    .aria_label("Complete terminal paste review")
                    .h(window.bounds().size.height / 3.),
            );
            if self.terminal.operation.is_none() {
                panel = panel
                    .child(self.button(
                        "confirm-terminal-paste",
                        "Paste reviewed lines…",
                        UiAction::ConfirmTerminalPaste,
                        palette,
                        cx,
                    ))
                    .child(self.button(
                        "cancel-terminal-paste",
                        "Cancel paste",
                        UiAction::CancelTerminalPaste,
                        palette,
                        cx,
                    ));
            }
        }
        if let Some(view) = &self.terminal_view {
            panel = panel.child(
                div()
                    .w_full()
                    .min_w_0()
                    .h(window.bounds().size.height / 2.)
                    .child(view.clone()),
            );
        }
        if self.terminal.operation.is_some() {
            panel = panel.child(gpui::text!("Waiting for the terminal runtime…"));
        } else if self.terminal.selected.is_some() && self.terminal.frame.is_none() {
            panel = panel.child(gpui::text!("Loading terminal screen…"));
        }
        panel
    }
}
