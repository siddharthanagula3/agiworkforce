#[derive(Default)]
pub struct HistoryViewport {
    pub scroll: gpui::ScrollHandle,
    follow: bool,
}

impl HistoryViewport {
    pub fn top(&mut self) {
        self.follow = false;
        self.scroll
            .set_offset(gpui::point(gpui::px(0.), gpui::px(0.)));
    }
    pub fn following(&self) -> bool {
        self.follow && self.scroll.offset().y <= -self.scroll.max_offset().y
    }
    pub fn latest(&mut self) {
        self.follow = true;
        self.scroll.scroll_to_bottom();
    }
    pub fn older(&mut self) {
        self.follow = false;
    }
    pub fn keep_latest(&self) {
        if self.following() {
            self.scroll.scroll_to_bottom();
        }
    }
}
