# Area 53. Skill creation and management

36 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S53.01 Skill directory.
- Should: A user can browse a catalogue of available skills, including ones not yet installed, and open any of them.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/settings-nav.ts:303; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/directory/hooks/useDirectoryAdapter.ts:356; apps/web/features/directory/services/skills-directory.ts:182; apps/web/app/api/skills/route.ts:97; apps/mobile/src/features/skills/service.ts:51; apps/mobile/app/(app)/skills/index.tsx:4

## S53.02 Installed Skills.
- Should: A user can see the list of skills installed/active for them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/settings-nav.ts:303; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/directory/services/skills-directory.ts:140; apps/web/features/directory/hooks/useDirectoryAdapter.ts:356; apps/web/app/api/skills/route.ts:97; apps/mobile/src/features/drawer/components/DrawerContent.tsx:115; apps/mobile/app/(app)/skills/index.tsx:1; apps/mobile/src/features/skills/SkillsScreen.tsx:240

## S53.03 Personal Skills.
- Should: A user can own personal skills that only they have and that they created or added.
- Status: web done, desktop done, mobile partial, cli done, vscode done, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11; apps/mobile/src/features/skills/SkillsScreen.tsx:789; apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/skills.rs:142; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:89; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:31
- Unfinished: mobile: mobile New skill is built (POST /api/skills, shown when canAuthorSkills)

## S53.04 Project Skills.
- Should: Skills can be scoped to a project so they load only in that project.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/skills.rs:142; apps/cli/src/skills.rs:190; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:89; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:31; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:101

## S53.05 Organization Skills.
- Should: An organization can provide skills that all its members get.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.06 Skill detail page.
- Should: A user can open a skill detail view showing its description, instructions and files.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/SkillDetailView.tsx:101; packages/ui/ui/src/directory/SkillDetailView.tsx:147; apps/web/features/directory/services/skills-directory.ts:265

## S53.07 Skill name and description.
- Should: Each skill shows its name and a description of what it does.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/settings-modal/SettingsModal.tsx:1966; apps/web/features/directory/services/skills-directory.ts:82; apps/web/app/api/skills/route.ts:97; apps/mobile/app/(app)/skills/index.tsx:1; apps/mobile/src/features/skills/SkillsScreen.tsx:240; apps/mobile/src/features/skills/service.ts:19; apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/repl/slash_commands.rs:176

## S53.08 Invocation guidance.
- Should: The product tells users how and when a skill is invoked (slash name, button, or automatic matching).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/directory/services/skills-directory.ts:82; packages/ui/ui/src/directory/SkillDetailView.tsx:135; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1333; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:172; apps/mobile/src/features/skills/SkillsScreen.tsx:326; apps/mobile/src/features/skills/SkillsScreen.tsx:290; apps/mobile/src/features/skills/SkillsScreen.tsx:538; apps/cli/src/tui/tui_app.rs:4384

## S53.09 Instruction editor.
- Should: A user can write and edit a skill's instructions in an editor in the product.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11

## S53.10 Reference-file bundle.
- Should: A skill can bundle reference files that the model reads when the skill runs.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1982; apps/web/features/plugins/server/directory/installed-skills.ts:215; apps/web/features/plugins/server/directory/skill-companions.ts:62; apps/web/features/plugins/server/directory/skill-companions.ts:153; apps/web/lib/services/user-skill-service.ts:362; apps/web/app/api/skills/[name]/files/route.ts:32; apps/cli/src/skills.rs:970; apps/cli/src/skills.rs:831

## S53.11 Script bundle.
- Should: A skill can bundle scripts that run when the skill is used.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1868; apps/web/lib/e2b/skill-staging.ts:80; apps/web/lib/e2b/skill-staging.ts:94; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3074; apps/cli/src/skills.rs:970; apps/cli/src/skills.rs:831

## S53.12 Input parameters.
- Should: A skill declares input parameters the user or model fills in when invoking it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.13 Expected outputs.
- Should: A skill declares the outputs it is expected to produce.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.14 Required tools.
- Should: A skill declares the tools it needs and the product shows or enforces that requirement.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:172; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2393; apps/web/app/api/skills/route.ts:132; apps/mobile/src/features/skills/SkillsScreen.tsx:240; apps/mobile/src/features/skills/service.ts:19; apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/features/exec/tools/mod.rs:348; apps/cli/src/skills.rs:944

## S53.15 Required connections.
- Should: A skill declares the connectors/MCP servers it needs and the product shows or enforces it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/SkillDetailView.tsx:101; apps/web/features/directory/services/skills-directory.ts:348; apps/web/app/api/skills/route.ts:165; packages/tools/skills/src/tool.ts:180

## S53.16 Supported surfaces.
- Should: A skill shows which surfaces (web, desktop, CLI...) it works on.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.17 Manual invocation.
- Should: A user can explicitly pick a skill for a message and the model then uses that skill.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing, api done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:909; apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:172; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2950; apps/web/lib/hooks/useChatStream.ts:3542; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:613; apps/mobile/src/features/skills/SkillsScreen.tsx:290; apps/mobile/src/features/skills/SkillsScreen.tsx:538; apps/mobile/app/(app)/(tabs)/chat.tsx:415

## S53.18 Automatic relevance-based invocation.
- Should: Without being asked, the product loads a skill whose description matches the user's request.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:909; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3742; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:639; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1831; apps/mobile/app/(app)/(tabs)/chat.tsx:415; apps/mobile/stores/chat/chatExecutionStore.ts:1761; apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/agent/prompt.rs:411

## S53.19 Skill composition.
- Should: A skill can call or build on other skills as part of its workflow.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.20 Enable/disable.
- Should: A user can turn an installed skill off and back on without deleting it.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/directory/SkillDetailView.tsx:119; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1029; apps/web/lib/services/skill-install-service.ts:49; apps/cli/src/tui/tui_app.rs:3932; apps/cli/src/skills.rs:353; apps/cli/src/skills.rs:121; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:109

## S53.21 Upload/import.
- Should: A user can upload or import a skill file/package and use it.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/lib/services/user-skill-authoring.ts:11; apps/cli/src/skills.rs:1031

## S53.22 Export.
- Should: A user can export/download a skill.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/SkillFileViewer.tsx:180; apps/web/features/directory/hooks/useDirectoryAdapter.ts:1131; apps/web/app/api/skills/[name]/files/[...path]/route.ts:61

## S53.23 Version selection.
- Should: A user can choose which version of a skill to use.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.24 Update notification.
- Should: The product notifies users when an installed skill has an update.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.25 Organization sharing.
- Should: A user can share a skill with their organization.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.26 Skill duplication/customization.
- Should: A user can duplicate a skill (e.g. a built-in one) and customize the copy.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.27 Recorded-demonstration creation.
- Should: A user can create a skill by recording a demonstration of the task.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S53.28 Screen-and-voice teaching flow.
- Should: A user can teach a skill by showing the screen and narrating with voice.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.29 Replay configuration.
- Should: A recorded skill has configurable replay settings.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.30 Example-based template creation.
- Should: A user can create a skill from examples or a template, with the product generating the skill.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.31 Test cases.
- Should: A skill carries test cases.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.32 Test results.
- Should: The product shows results of running a skill's tests.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.33 With-versus-without comparison.
- Should: The product compares outputs with and without a skill.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.34 Cost estimate.
- Should: The product estimates the cost of running a skill.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.35 Performance history.
- Should: The product shows a skill's performance history (usage, success).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S53.36 Permission and provenance summary.
- Should: A skill shows a summary of the permissions it uses and where it came from.
- Status: web done, desktop done, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/directory/SkillDetailView.tsx:64; apps/web/features/directory/services/skills-directory.ts:348
