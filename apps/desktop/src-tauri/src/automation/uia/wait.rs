use super::*;
use anyhow::{anyhow, Result};
use std::time::{Duration, Instant};
use tokio::time::sleep;

#[derive(Debug, Clone)]
pub struct WaitConfig {
    pub timeout: Duration,
    pub interval: Duration,
    pub retry_count: usize,
}

impl Default for WaitConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(10),
            interval: Duration::from_millis(100),
            retry_count: 100,
        }
    }
}

impl UIAutomationService {
    pub async fn wait_for_element(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
        config: Option<WaitConfig>,
    ) -> Result<UIElementInfo> {
        let config = config.unwrap_or_default();
        let start = Instant::now();
        let mut attempt = 0;

        loop {
            match self.find_elements(parent_id.clone(), query) {
                Ok(elements) if !elements.is_empty() => {
                    return Ok(elements[0].clone());
                }
                Ok(_) => {}
                Err(_) => {}
            }

            attempt += 1;
            if start.elapsed() >= config.timeout || attempt >= config.retry_count {
                return Err(anyhow!(
                    "Element not found after {} attempts ({}ms timeout)",
                    attempt,
                    config.timeout.as_millis()
                ));
            }

            sleep(config.interval).await;
        }
    }

    pub async fn wait_for_element_visible(
        &self,
        element_id: &str,
        config: Option<WaitConfig>,
    ) -> Result<()> {
        let config = config.unwrap_or_default();
        let start = Instant::now();
        let mut attempt = 0;

        loop {
            match self.bounding_rect(element_id) {
                Ok(Some(rect)) if rect.width > 0.0 && rect.height > 0.0 => {
                    return Ok(());
                }
                Ok(_) => {}
                Err(_) => {}
            }

            attempt += 1;
            if start.elapsed() >= config.timeout || attempt >= config.retry_count {
                return Err(anyhow!(
                    "Element {} not visible after {} attempts",
                    element_id,
                    attemp
                ));
            }

            sleep(config.interval).await;
        }
    }

    pub async fn wait_for_element_enabled(
        &self,
        element_id: &str,
        config: Option<WaitConfig>,
    ) -> Result<()> {
        let config = config.unwrap_or_default();
        let start = Instant::now();
        let mut attempt = 0;

        loop {
            let element = self.get_element(element_id)?;

            let is_enabled = unsafe { element.CurrentIsEnabled() }
                .map_err(|err| anyhow!("CurrentIsEnabled failed: {err:?}"))?;

            if is_enabled.as_bool() {
                return Ok(());
            }

            attempt += 1;
            if start.elapsed() >= config.timeout || attempt >= config.retry_count {
                return Err(anyhow!(
                    "Element {} not enabled after {} attempts",
                    element_id,
                    attemp
                ));
            }

            sleep(config.interval).await;
        }
    }

    pub async fn retry_with_backoff<F, T, E>(
        &self,
        mut operation: F,
        max_retries: usize,
        initial_delay: Duration,
    ) -> Result<T>
    where
        F: FnMut() -> std::result::Result<T, E>,
        E: std::fmt::Display,
    {
        let mut delay = initial_delay;
        let mut last_error = None;

        for attempt in 0..max_retries {
            match operation() {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_retries - 1 {
                        sleep(delay).await;
                        delay *= 2;
                    }
                }
            }
        }

        Err(anyhow!(
            "Operation failed after {} retries: {}",
            max_retries,
            last_error
                .map(|e| e.to_string())
                .unwrap_or_else(|| "Unknown error".to_string())
        ))
    }

    pub fn find_element_smart(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>> {
        if let Ok(elements) = self.find_elements(parent_id.clone(), query) {
            if !elements.is_empty() {
                return Ok(elements);
            }
        }

        if let Some(name) = &query.name {
            let mut partial_query = query.clone();

            if name.len() >= 3 {
                partial_query.name = Some(name[..name.len().min(10)].to_string());
                if let Ok(elements) = self.find_elements(parent_id.clone(), &partial_query) {
                    if !elements.is_empty() {
                        return Ok(elements);
                    }
                }
            }
        }

        if let Some(name) = &query.name {
            let mut case_insensitive_query = query.clone();

            case_insensitive_query.name = Some(name.to_lowercase());
            if let Ok(elements) = self.find_elements(parent_id.clone(), &case_insensitive_query) {
                if !elements.is_empty() {
                    return Ok(elements);
                }
            }
        }

        if query.control_type.is_some() {
            let type_only_query = ElementQuery {
                window: query.window.clone(),
                window_class: query.window_class.clone(),
                name: None,
                class_name: None,
                automation_id: None,
                control_type: query.control_type.clone(),
                max_results: query.max_results,
            };
            if let Ok(elements) = self.find_elements(parent_id, &type_only_query) {
                return Ok(elements);
            }
        }

        Err(anyhow!("Element not found with any strategy"))
    }
}
