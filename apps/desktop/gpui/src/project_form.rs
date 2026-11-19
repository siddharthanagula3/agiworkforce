use crate::{
    config::{NativeContracts, Palette},
    native_controls,
    projects::ProjectEdit,
};
use gpui::{div, prelude::*, px, rgb, Context, Entity, Window};
use gpui_component::input::{Input, InputState, Textarea, TextareaState};

#[derive(Clone, Copy)]
pub enum ProjectFormAction {
    Save(uuid::Uuid),
    Cancel(uuid::Uuid),
}

pub struct ProjectFormFields<'a> {
    pub name: &'a Entity<InputState>,
    pub description: &'a Entity<TextareaState>,
    pub instructions: &'a Entity<TextareaState>,
}

pub struct ProjectFormProps<'a> {
    pub edit: &'a ProjectEdit,
    pub fields: ProjectFormFields<'a>,
    pub busy: bool,
    pub needs_review: bool,
    pub contracts: &'a NativeContracts,
}

pub fn form<V: 'static>(
    props: ProjectFormProps<'_>,
    palette: Palette,
    handler: impl Fn(&mut V, ProjectFormAction, &mut Window, &mut Context<V>) + Clone + 'static,
    cx: &mut Context<V>,
) -> gpui::Stateful<gpui::Div> {
    let ProjectFormProps {
        edit,
        fields,
        busy,
        needs_review,
        contracts,
    } = props;
    let edit_id = edit.id;
    let admitted = edit
        .original
        .as_ref()
        .is_none_or(|project| project.can_edit && project.version.is_some());
    let mut panel = div()
        .id("project-edit-form")
        .role(gpui::Role::Group)
        .aria_label("Project details")
        .w_full()
        .min_w_0()
        .flex()
        .flex_col()
        .gap_2()
        .child(gpui::text!(if edit.original.is_none() {
            "New project"
        } else {
            "Proposed project details"
        }))
        .child(gpui::text!("Name"))
        .child(
            Input::new(fields.name)
                .aria_label("Project name")
                .border(px(contracts.stroke_width))
                .border_color(rgb(palette.secondary))
                .readonly(busy || !admitted),
        )
        .child(gpui::text!("Description"))
        .child(
            Textarea::new(fields.description)
                .aria_label("Project description")
                .border(px(contracts.stroke_width))
                .border_color(rgb(palette.secondary))
                .readonly(busy || !admitted),
        )
        .child(gpui::text!("Instructions"))
        .child(
            Textarea::new(fields.instructions)
                .aria_label("Project instructions")
                .border(px(contracts.stroke_width))
                .border_color(rgb(palette.secondary))
                .readonly(busy || !admitted),
        );
    if !busy && !needs_review && admitted {
        let action = handler.clone();
        panel = panel.child(native_controls::button(
            "save-project",
            "Save project",
            move |view, window, cx| action(view, ProjectFormAction::Save(edit_id), window, cx),
            contracts,
            palette,
            cx,
        ));
    }
    if !busy {
        panel = panel.child(native_controls::button(
            "cancel-project-edit",
            "Cancel edit",
            move |view, window, cx| handler(view, ProjectFormAction::Cancel(edit_id), window, cx),
            contracts,
            palette,
            cx,
        ));
    }
    panel
}
