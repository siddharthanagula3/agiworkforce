use std::collections::HashMap;

use agiworkforce_protocol::models::local_image_label_text;
use agiworkforce_protocol::user_input::TextElement;

use crate::bottom_pane::LocalImageAttachment;

use super::UserMessage;

pub(super) fn append_text_with_rebased_elements(
    target_text: &mut String,
    target_text_elements: &mut Vec<TextElement>,
    text: &str,
    text_elements: impl IntoIterator<Item = TextElement>,
) {
    let offset = target_text.len();
    target_text.push_str(text);
    target_text_elements.extend(text_elements.into_iter().map(|mut element| {
        element.byte_range.start += offset;
        element.byte_range.end += offset;
        element
    }));
}

// When merging multiple queued drafts (e.g., after interrupt), each draft starts numbering
// its attachments at [Image #1]. Reassign placeholder labels based on the attachment list so
// the combined local_image_paths order matches the labels, even if placeholders were moved
// in the text (e.g., [Image #2] appearing before [Image #1]).
pub(super) fn remap_placeholders_for_message(
    message: UserMessage,
    next_label: &mut usize,
) -> UserMessage {
    let UserMessage {
        text,
        text_elements,
        local_images,
        remote_image_urls,
        mention_bindings,
    } = message;
    if local_images.is_empty() {
        return UserMessage {
            text,
            text_elements,
            local_images,
            remote_image_urls,
            mention_bindings,
        };
    }

    let mut mapping: HashMap<String, String> = HashMap::new();
    let mut remapped_images = Vec::new();
    for attachment in local_images {
        let new_placeholder = local_image_label_text(*next_label);
        *next_label += 1;
        mapping.insert(attachment.placeholder.clone(), new_placeholder.clone());
        remapped_images.push(LocalImageAttachment {
            placeholder: new_placeholder,
            path: attachment.path,
        });
    }

    let mut elements = text_elements;
    elements.sort_by_key(|elem| elem.byte_range.start);

    let mut cursor = 0usize;
    let mut rebuilt = String::new();
    let mut rebuilt_elements = Vec::new();
    for mut elem in elements {
        let start = elem.byte_range.start.min(text.len());
        let end = elem.byte_range.end.min(text.len());
        if let Some(segment) = text.get(cursor..start) {
            rebuilt.push_str(segment);
        }

        let original = text.get(start..end).unwrap_or("");
        let placeholder = elem.placeholder(&text);
        let replacement = placeholder
            .and_then(|ph| mapping.get(ph))
            .map(String::as_str)
            .unwrap_or(original);

        let elem_start = rebuilt.len();
        rebuilt.push_str(replacement);
        let elem_end = rebuilt.len();

        if let Some(remapped) = placeholder.and_then(|ph| mapping.get(ph)) {
            elem.set_placeholder(Some(remapped.clone()));
        }
        elem.byte_range = (elem_start..elem_end).into();
        rebuilt_elements.push(elem);
        cursor = end;
    }
    if let Some(segment) = text.get(cursor..) {
        rebuilt.push_str(segment);
    }

    UserMessage {
        text: rebuilt,
        local_images: remapped_images,
        remote_image_urls,
        text_elements: rebuilt_elements,
        mention_bindings,
    }
}

pub(super) fn merge_user_messages(messages: Vec<UserMessage>) -> UserMessage {
    let mut combined = UserMessage {
        text: String::new(),
        text_elements: Vec::new(),
        local_images: Vec::new(),
        remote_image_urls: Vec::new(),
        mention_bindings: Vec::new(),
    };
    let total_remote_images = messages
        .iter()
        .map(|message| message.remote_image_urls.len())
        .sum::<usize>();
    let mut next_image_label = total_remote_images + 1;

    for (idx, message) in messages.into_iter().enumerate() {
        if idx > 0 {
            combined.text.push('\n');
        }
        let UserMessage {
            text,
            text_elements,
            local_images,
            remote_image_urls,
            mention_bindings,
        } = remap_placeholders_for_message(message, &mut next_image_label);
        append_text_with_rebased_elements(
            &mut combined.text,
            &mut combined.text_elements,
            &text,
            text_elements,
        );
        combined.local_images.extend(local_images);
        combined.remote_image_urls.extend(remote_image_urls);
        combined.mention_bindings.extend(mention_bindings);
    }

    combined
}
