//! Weather integration for briefings

use serde::{Deserialize, Serialize};

use crate::sys::error::{Error, Result};

/// Weather condition data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherData {
    pub temperature: f32,
    pub feels_like: f32,
    pub humidity: i32,
    pub description: String,
    pub icon: String,
    pub wind_speed: f32,
    pub city: String,
    pub country: String,
}

/// Weather forecast for a day
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherForecast {
    pub date: String,
    pub high: f32,
    pub low: f32,
    pub description: String,
    pub precipitation_chance: i32,
}

/// Configuration for weather provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherConfig {
    pub enabled: bool,
    pub api_key: Option<String>,
    pub city: Option<String>,
    pub units: WeatherUnits,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum WeatherUnits {
    #[default]
    Metric,
    Imperial,
}

impl Default for WeatherConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            api_key: None,
            city: None,
            units: WeatherUnits::Metric,
        }
    }
}

/// Weather provider for fetching weather data
pub struct WeatherProvider {
    config: WeatherConfig,
    client: reqwest::Client,
}

impl WeatherProvider {
    pub fn new(config: WeatherConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    /// Fetch current weather
    pub async fn fetch_current(&self) -> Result<Option<WeatherData>> {
        if !self.config.enabled {
            return Ok(None);
        }

        let api_key = match &self.config.api_key {
            Some(k) => k,
            None => return Ok(None),
        };

        let city = self.config.city.as_deref().unwrap_or("London");
        let units = match self.config.units {
            WeatherUnits::Metric => "metric",
            WeatherUnits::Imperial => "imperial",
        };

        let url = format!(
            "https://api.openweathermap.org/data/2.5/weather?q={}&appid={}&units={}",
            city, api_key, units
        );

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Generic(format!("Weather API error: {}", e)))?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| Error::Generic(format!("Failed to parse weather: {}", e)))?;

        Ok(Some(WeatherData {
            temperature: data["main"]["temp"].as_f64().unwrap_or(0.0) as f32,
            feels_like: data["main"]["feels_like"].as_f64().unwrap_or(0.0) as f32,
            humidity: data["main"]["humidity"].as_i64().unwrap_or(0) as i32,
            description: data["weather"][0]["description"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            icon: data["weather"][0]["icon"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            wind_speed: data["wind"]["speed"].as_f64().unwrap_or(0.0) as f32,
            city: data["name"].as_str().unwrap_or(city).to_string(),
            country: data["sys"]["country"].as_str().unwrap_or("").to_string(),
        }))
    }

    /// Format weather for briefing
    #[must_use]
    pub fn format_for_briefing(weather: &WeatherData, units: WeatherUnits) -> String {
        let temp_unit = match units {
            WeatherUnits::Metric => "C",
            WeatherUnits::Imperial => "F",
        };

        let speed_unit = match units {
            WeatherUnits::Metric => "m/s",
            WeatherUnits::Imperial => "mph",
        };

        format!(
            "Weather in {}: {} ({:.0}{}, feels like {:.0}{}). Humidity: {}%, Wind: {:.1} {}",
            weather.city,
            weather.description,
            weather.temperature,
            temp_unit,
            weather.feels_like,
            temp_unit,
            weather.humidity,
            weather.wind_speed,
            speed_unit
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_weather_config_default() {
        let config = WeatherConfig::default();
        assert!(!config.enabled);
        assert!(config.api_key.is_none());
        assert!(config.city.is_none());
        assert!(matches!(config.units, WeatherUnits::Metric));
    }

    #[test]
    fn test_format_for_briefing_metric() {
        let weather = WeatherData {
            temperature: 22.5,
            feels_like: 24.0,
            humidity: 65,
            description: "partly cloudy".to_string(),
            icon: "03d".to_string(),
            wind_speed: 3.5,
            city: "London".to_string(),
            country: "GB".to_string(),
        };

        let formatted = WeatherProvider::format_for_briefing(&weather, WeatherUnits::Metric);
        assert!(formatted.contains("London"));
        assert!(formatted.contains("partly cloudy"));
        assert!(formatted.contains("22C")); // 22.5 rounds to 22 (banker's rounding)
        assert!(formatted.contains("24C"));
        assert!(formatted.contains("65%"));
        assert!(formatted.contains("m/s"));
    }

    #[test]
    fn test_format_for_briefing_imperial() {
        let weather = WeatherData {
            temperature: 72.0,
            feels_like: 75.0,
            humidity: 50,
            description: "sunny".to_string(),
            icon: "01d".to_string(),
            wind_speed: 5.0,
            city: "New York".to_string(),
            country: "US".to_string(),
        };

        let formatted = WeatherProvider::format_for_briefing(&weather, WeatherUnits::Imperial);
        assert!(formatted.contains("New York"));
        assert!(formatted.contains("sunny"));
        assert!(formatted.contains("72F"));
        assert!(formatted.contains("75F"));
        assert!(formatted.contains("50%"));
        assert!(formatted.contains("mph"));
    }

    #[tokio::test]
    async fn test_fetch_current_disabled() {
        let config = WeatherConfig::default();
        let provider = WeatherProvider::new(config);
        let result = provider.fetch_current().await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_fetch_current_no_api_key() {
        let config = WeatherConfig {
            enabled: true,
            api_key: None,
            city: Some("London".to_string()),
            units: WeatherUnits::Metric,
        };
        let provider = WeatherProvider::new(config);
        let result = provider.fetch_current().await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }
}
