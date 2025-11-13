use serde::{Deserialize, Serialize};
use crate::workflows::publishing::WorkflowCategory;

/// Pre-built workflow template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowTemplate {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: WorkflowCategory,
    pub tags: Vec<String>,
    pub estimated_time_saved: u64, // minutes
    pub estimated_cost_saved: f64, // dollars
    pub difficulty: TemplateDifficulty,
    pub setup_instructions: String,
    pub sample_results: String,
    pub success_stories: Vec<String>,
    pub workflow_json: String, // Simplified JSON representation
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TemplateDifficulty {
    Beginner,
    Intermediate,
    Advanced,
}

/// Get all pre-built workflow templates
pub fn get_all_templates() -> Vec<WorkflowTemplate> {
    vec![
        // ===== CUSTOMER SUPPORT (10 templates) =====
        WorkflowTemplate {
            id: "cs-auto-respond".to_string(),
            title: "Auto-respond to Common Questions".to_string(),
            description: "Automatically detect and respond to frequently asked questions in customer emails and tickets".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["email".to_string(), "automation".to_string(), "nlp".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 50.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Connect email account\n2. Define FAQ responses\n3. Set confidence threshold\n4. Enable auto-reply".to_string(),
            sample_results: "Handles 70% of common inquiries automatically, reducing response time from 4 hours to 2 minutes".to_string(),
            success_stories: vec![
                "SaaS company reduced support tickets by 65%".to_string(),
                "E-commerce store saved $3K/month in support costs".to_string(),
            ],
            workflow_json: r#"{"trigger":"email_received","actions":["analyze_question","match_faq","send_response"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-ticket-routing".to_string(),
            title: "Intelligent Ticket Categorization and Routing".to_string(),
            description: "Automatically categorize support tickets and route to the right team member based on expertise".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["tickets".to_string(), "routing".to_string(), "ai".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 75.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Integrate ticketing system\n2. Define categories and team expertise\n3. Train classifier on historical tickets\n4. Enable auto-routing".to_string(),
            sample_results: "95% routing accuracy, 50% faster ticket resolution, reduced misrouted tickets by 80%".to_string(),
            success_stories: vec![
                "Tech company improved first-response time by 60%".to_string(),
                "Service desk resolved 40% more tickets per day".to_string(),
            ],
            workflow_json: r#"{"trigger":"ticket_created","actions":["categorize","assign_to_expert","notify_team"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-satisfaction-survey".to_string(),
            title: "Automated Customer Satisfaction Surveys".to_string(),
            description: "Send CSAT surveys after ticket resolution and track trends over time".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["survey".to_string(), "feedback".to_string(), "analytics".to_string()],
            estimated_time_saved: 60,
            estimated_cost_saved: 25.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Design survey questions\n2. Set trigger timing (e.g., 1 hour after ticket close)\n3. Configure email template\n4. Setup analytics dashboard".to_string(),
            sample_results: "3x higher survey response rate, real-time CSAT tracking, early detection of service issues".to_string(),
            success_stories: vec![
                "Increased survey responses from 12% to 38%".to_string(),
            ],
            workflow_json: r#"{"trigger":"ticket_closed","delay":"1h","actions":["send_survey","collect_response","update_dashboard"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-escalation-detector".to_string(),
            title: "Urgent Issue Escalation Detector".to_string(),
            description: "Detect frustrated customers and escalate to senior support automatically".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["escalation".to_string(), "sentiment".to_string(), "priority".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Configure sentiment analysis\n2. Define escalation criteria\n3. Set up senior team notifications\n4. Create escalation playbook".to_string(),
            sample_results: "Prevents 85% of potential churns, reduces escalation response time from 6 hours to 15 minutes".to_string(),
            success_stories: vec![
                "Retained $500K in annual revenue from at-risk accounts".to_string(),
            ],
            workflow_json: r#"{"trigger":"message_received","actions":["analyze_sentiment","check_criteria","escalate_if_urgent","notify_manager"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-knowledge-base-suggester".to_string(),
            title: "Knowledge Base Article Suggester".to_string(),
            description: "Suggest relevant KB articles to customers and agents based on ticket content".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["knowledge base".to_string(), "search".to_string(), "self-service".to_string()],
            estimated_time_saved: 75,
            estimated_cost_saved: 40.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Index knowledge base articles\n2. Configure semantic search\n3. Set relevance threshold\n4. Enable article suggestions in ticket UI".to_string(),
            sample_results: "40% of tickets resolved via self-service, 25% reduction in average handle time".to_string(),
            success_stories: vec![
                "Support team handled 2x more tickets with same headcount".to_string(),
            ],
            workflow_json: r#"{"trigger":"ticket_viewed","actions":["extract_keywords","search_kb","rank_articles","display_suggestions"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-first-response-automation".to_string(),
            title: "First Response Time Optimizer".to_string(),
            description: "Send immediate acknowledgment with estimated wait time and self-service options".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["response time".to_string(), "sla".to_string(), "automation".to_string()],
            estimated_time_saved: 45,
            estimated_cost_saved: 20.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Create response templates\n2. Calculate queue wait times\n3. Link self-service resources\n4. Enable instant acknowledgment".to_string(),
            sample_results: "100% tickets acknowledged within 1 minute, 30% deflected to self-service".to_string(),
            success_stories: vec![
                "Improved NPS by 15 points through better expectations".to_string(),
            ],
            workflow_json: r#"{"trigger":"ticket_created","actions":["send_acknowledgment","estimate_wait","suggest_self_service"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-refund-approver".to_string(),
            title: "Automated Refund Request Approver".to_string(),
            description: "Automatically approve refunds under threshold, escalate larger requests".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["refunds".to_string(), "approval".to_string(), "policy".to_string()],
            estimated_time_saved: 100,
            estimated_cost_saved: 60.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Define refund policy rules\n2. Set auto-approval thresholds\n3. Configure payment gateway\n4. Setup approval workflows for exceptions".to_string(),
            sample_results: "95% of refunds processed instantly, reduced processing time from 3 days to 5 minutes".to_string(),
            success_stories: vec![
                "E-commerce site improved refund experience, reduced chargebacks by 40%".to_string(),
            ],
            workflow_json: r#"{"trigger":"refund_request","actions":["check_policy","validate_amount","process_or_escalate"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-multi-channel-sync".to_string(),
            title: "Multi-Channel Conversation Sync".to_string(),
            description: "Sync customer conversations across email, chat, phone into single ticket view".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["omnichannel".to_string(), "sync".to_string(), "history".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 80.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Connect all communication channels\n2. Set up customer identity resolution\n3. Configure conversation threading\n4. Enable unified timeline view".to_string(),
            sample_results: "100% conversation history visible, eliminated 'can you repeat that' moments".to_string(),
            success_stories: vec![
                "Support team provided more personalized service with full context".to_string(),
            ],
            workflow_json: r#"{"trigger":"message_any_channel","actions":["identify_customer","link_to_ticket","update_timeline"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-sla-monitor".to_string(),
            title: "SLA Breach Prevention Monitor".to_string(),
            description: "Monitor ticket aging and alert team before SLA breaches occur".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["sla".to_string(), "monitoring".to_string(), "alerts".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 200.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Define SLA targets by priority\n2. Set up breach warnings (e.g., 80% of time elapsed)\n3. Configure notification escalations\n4. Create SLA dashboard".to_string(),
            sample_results: "Reduced SLA breaches by 90%, improved customer satisfaction by 25%".to_string(),
            success_stories: vec![
                "Enterprise support team maintained 99% SLA compliance".to_string(),
            ],
            workflow_json: r#"{"trigger":"every_15_minutes","actions":["check_ticket_age","calculate_time_remaining","alert_if_at_risk"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "cs-bug-reporter".to_string(),
            title: "Automatic Bug Report Creator".to_string(),
            description: "Detect bug reports in tickets and automatically create engineering tickets".to_string(),
            category: WorkflowCategory::CustomerSupport,
            tags: vec!["bugs".to_string(), "engineering".to_string(), "automation".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 45.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Connect support and engineering systems\n2. Define bug detection patterns\n3. Create bug report template\n4. Set up duplicate detection".to_string(),
            sample_results: "90% of bugs automatically logged, reduced duplicate bug reports by 70%".to_string(),
            success_stories: vec![
                "Product team received consistent, high-quality bug reports".to_string(),
            ],
            workflow_json: r#"{"trigger":"ticket_updated","actions":["detect_bug_keywords","check_duplicates","create_jira_ticket","link_tickets"]}"#.to_string(),
        },

        // ===== SALES & MARKETING (15 templates) =====
        WorkflowTemplate {
            id: "sm-lead-enrichment".to_string(),
            title: "LinkedIn Lead Enrichment".to_string(),
            description: "Automatically enrich leads with LinkedIn profile data, company info, and social presence".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["leads".to_string(), "enrichment".to_string(), "linkedin".to_string()],
            estimated_time_saved: 200,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect CRM\n2. Configure LinkedIn API access\n3. Define enrichment fields\n4. Set up auto-enrichment triggers".to_string(),
            sample_results: "Enriched 95% of leads automatically, improved targeting accuracy by 60%".to_string(),
            success_stories: vec![
                "B2B SaaS increased qualified lead rate from 15% to 42%".to_string(),
            ],
            workflow_json: r#"{"trigger":"lead_created","actions":["search_linkedin","extract_profile","update_crm"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-email-sequence".to_string(),
            title: "Personalized Email Sequence Sender".to_string(),
            description: "Send multi-touch email campaigns with A/B testing and behavior-based triggers".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["email".to_string(), "campaigns".to_string(), "personalization".to_string()],
            estimated_time_saved: 300,
            estimated_cost_saved: 150.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Design email sequence\n2. Set up trigger conditions\n3. Configure A/B test variants\n4. Define success metrics".to_string(),
            sample_results: "3x higher open rates, 5x higher conversion rates vs manual emails".to_string(),
            success_stories: vec![
                "Closed $2M in pipeline with automated outreach".to_string(),
            ],
            workflow_json: r#"{"trigger":"lead_status_change","actions":["select_template","personalize","schedule_send","track_engagement"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-social-scheduler".to_string(),
            title: "Multi-Platform Social Media Scheduler".to_string(),
            description: "Schedule and publish content across Twitter, LinkedIn, Facebook with optimal timing".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["social media".to_string(), "scheduling".to_string(), "content".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 90.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Connect social accounts\n2. Create content calendar\n3. Set optimal posting times\n4. Enable auto-posting".to_string(),
            sample_results: "3x more consistent posting, 2x engagement rates, saved 15 hours/week".to_string(),
            success_stories: vec![
                "Grew Twitter following from 5K to 50K in 6 months".to_string(),
            ],
            workflow_json: r#"{"trigger":"scheduled_time","actions":["fetch_content","optimize_format","post_to_platforms","track_engagement"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-blog-distributor".to_string(),
            title: "Blog Post to Social Media Distributor".to_string(),
            description: "Automatically create social posts from new blog articles with AI-generated captions".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["blog".to_string(), "content".to_string(), "distribution".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 45.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect blog RSS/API\n2. Configure post templates\n3. Set up AI caption generation\n4. Define posting schedule".to_string(),
            sample_results: "Every blog post gets 5+ social posts automatically, 4x more traffic to blog".to_string(),
            success_stories: vec![
                "Content marketing team distributed 100+ articles with zero manual effort".to_string(),
            ],
            workflow_json: r#"{"trigger":"new_blog_post","actions":["extract_key_points","generate_captions","create_images","schedule_posts"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-webinar-followup".to_string(),
            title: "Webinar Attendee Follow-up Automation".to_string(),
            description: "Send personalized follow-ups based on webinar attendance and engagement level".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["webinar".to_string(), "follow-up".to_string(), "engagement".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 80.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Integrate webinar platform\n2. Define engagement scoring\n3. Create follow-up templates\n4. Set up CRM sync".to_string(),
            sample_results: "100% follow-up rate, 3x higher meeting booking rate from webinars".to_string(),
            success_stories: vec![
                "Generated $500K pipeline from single webinar series".to_string(),
            ],
            workflow_json: r#"{"trigger":"webinar_ended","actions":["score_engagement","segment_attendees","send_targeted_followup"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-lead-scoring".to_string(),
            title: "Behavioral Lead Scoring Engine".to_string(),
            description: "Score leads based on website behavior, email engagement, and firmographic data".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["lead scoring".to_string(), "analytics".to_string(), "qualification".to_string()],
            estimated_time_saved: 240,
            estimated_cost_saved: 200.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Define scoring criteria\n2. Set up tracking pixels\n3. Configure point values\n4. Create MQL threshold alerts".to_string(),
            sample_results: "2x more accurate lead qualification, sales focuses on hottest 20% of leads".to_string(),
            success_stories: vec![
                "Increased win rate from 12% to 28% by focusing on high-score leads".to_string(),
            ],
            workflow_json: r#"{"trigger":"activity_tracked","actions":["update_score","check_threshold","notify_sales_if_mql"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-competitor-monitor".to_string(),
            title: "Competitive Intelligence Monitor".to_string(),
            description: "Track competitor mentions, pricing changes, and product launches automatically".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["competition".to_string(), "monitoring".to_string(), "intelligence".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Define competitor list\n2. Set up web monitoring\n3. Configure alert triggers\n4. Create digest reports".to_string(),
            sample_results: "Real-time competitive intelligence, proactive response to market changes".to_string(),
            success_stories: vec![
                "Responded to competitor pricing in 24 hours instead of 2 weeks".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily_check","actions":["scrape_competitor_sites","detect_changes","alert_team","update_battlecards"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-proposal-generator".to_string(),
            title: "AI Sales Proposal Generator".to_string(),
            description: "Generate customized sales proposals from CRM data and templates in minutes".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["proposals".to_string(), "sales".to_string(), "automation".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 120.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Create proposal templates\n2. Map CRM fields\n3. Configure pricing logic\n4. Set up e-signature integration".to_string(),
            sample_results: "Reduced proposal creation from 4 hours to 10 minutes, 40% higher close rate".to_string(),
            success_stories: vec![
                "Sales team created 3x more proposals with better quality".to_string(),
            ],
            workflow_json: r#"{"trigger":"opportunity_stage_change","actions":["fetch_crm_data","generate_proposal","add_pricing","send_for_signature"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-abandoned-cart".to_string(),
            title: "Abandoned Cart Recovery System".to_string(),
            description: "Automatically follow up on abandoned carts with personalized incentives".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["ecommerce".to_string(), "cart".to_string(), "recovery".to_string()],
            estimated_time_saved: 200,
            estimated_cost_saved: 500.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Integrate ecommerce platform\n2. Set cart abandonment trigger\n3. Create email sequence\n4. Define discount strategy".to_string(),
            sample_results: "Recovered 25% of abandoned carts, generated $50K additional revenue/month".to_string(),
            success_stories: vec![
                "E-commerce store recovered $250K in lost sales annually".to_string(),
            ],
            workflow_json: r#"{"trigger":"cart_abandoned_1h","actions":["send_reminder_email","offer_discount_if_2h","final_reminder_24h"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-review-requester".to_string(),
            title: "Customer Review Request Automation".to_string(),
            description: "Request reviews from happy customers at the perfect moment after purchase".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["reviews".to_string(), "feedback".to_string(), "reputation".to_string()],
            estimated_time_saved: 100,
            estimated_cost_saved: 75.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Define review trigger conditions\n2. Create request templates\n3. Set optimal timing\n4. Configure review platform integrations".to_string(),
            sample_results: "5x more reviews collected, improved star rating from 4.1 to 4.7".to_string(),
            success_stories: vec![
                "Local business went from 20 reviews to 500+ reviews in 6 months".to_string(),
            ],
            workflow_json: r#"{"trigger":"order_delivered_3days","actions":["check_satisfaction","send_review_request","track_submission"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-event-promoter".to_string(),
            title: "Event Marketing Automation".to_string(),
            description: "Promote events across channels, manage RSVPs, and send reminders automatically".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["events".to_string(), "promotion".to_string(), "reminders".to_string()],
            estimated_time_saved: 160,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Create event in system\n2. Configure promotion channels\n3. Set up RSVP tracking\n4. Schedule reminder sequence".to_string(),
            sample_results: "2x higher attendance rate, 90% reduction in no-shows".to_string(),
            success_stories: vec![
                "Consistently sold out events with automated marketing".to_string(),
            ],
            workflow_json: r#"{"trigger":"event_created","actions":["create_landing_page","promote_channels","send_reminders","track_attendance"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-influencer-outreach".to_string(),
            title: "Influencer Partnership Outreach".to_string(),
            description: "Find and reach out to relevant influencers with personalized partnership proposals".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["influencer".to_string(), "outreach".to_string(), "partnerships".to_string()],
            estimated_time_saved: 240,
            estimated_cost_saved: 150.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Define influencer criteria\n2. Set up discovery tools\n3. Create outreach templates\n4. Configure tracking".to_string(),
            sample_results: "Found and contacted 100+ relevant influencers, secured 15 partnerships".to_string(),
            success_stories: vec![
                "Brand reached 5M people through influencer partnerships".to_string(),
            ],
            workflow_json: r#"{"trigger":"weekly","actions":["search_influencers","score_relevance","send_outreach","track_responses"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-newsletter-curator".to_string(),
            title: "AI Newsletter Content Curator".to_string(),
            description: "Curate industry news and create newsletter content automatically".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["newsletter".to_string(), "content".to_string(), "curation".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 90.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Define content sources\n2. Set curation criteria\n3. Create newsletter template\n4. Schedule sending".to_string(),
            sample_results: "Weekly newsletter created in 10 minutes instead of 3 hours, 2x open rates".to_string(),
            success_stories: vec![
                "Newsletter subscriber count grew 400% with consistent quality".to_string(),
            ],
            workflow_json: r#"{"trigger":"weekly_monday","actions":["fetch_articles","rank_relevance","summarize","generate_newsletter"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-referral-tracker".to_string(),
            title: "Customer Referral Program Manager".to_string(),
            description: "Track referrals, automate rewards, and encourage viral growth".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["referrals".to_string(), "growth".to_string(), "rewards".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 80.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Design referral program\n2. Create referral links\n3. Set up reward triggers\n4. Configure tracking dashboard".to_string(),
            sample_results: "40% of new customers from referrals, $0 CAC for referred customers".to_string(),
            success_stories: vec![
                "SaaS company grew 30% month-over-month through referrals".to_string(),
            ],
            workflow_json: r#"{"trigger":"referral_signup","actions":["track_conversion","issue_reward","notify_referrer","encourage_sharing"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "sm-retargeting-sync".to_string(),
            title: "Cross-Platform Retargeting Sync".to_string(),
            description: "Sync audiences across Facebook, Google, LinkedIn for consistent retargeting".to_string(),
            category: WorkflowCategory::SalesMarketing,
            tags: vec!["retargeting".to_string(), "ads".to_string(), "sync".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 200.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Connect ad platforms\n2. Define audience segments\n3. Set up sync schedule\n4. Configure campaign triggers".to_string(),
            sample_results: "3x ROAS improvement, 50% lower cost per acquisition".to_string(),
            success_stories: vec![
                "Reduced wasted ad spend by $10K/month through better targeting".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily","actions":["export_segments","sync_to_platforms","update_campaigns","track_performance"]}"#.to_string(),
        },

        // ===== DEVELOPMENT (10 templates) =====
        WorkflowTemplate {
            id: "dev-pr-checklist".to_string(),
            title: "Pull Request Review Checklist".to_string(),
            description: "Automatically check PRs for tests, documentation, and code quality before review".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["github".to_string(), "code review".to_string(), "quality".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect GitHub/GitLab\n2. Define quality checks\n3. Configure auto-comments\n4. Set up approval rules".to_string(),
            sample_results: "90% of PRs pass quality gates, 50% faster code review process".to_string(),
            success_stories: vec![
                "Engineering team reduced bugs in production by 60%".to_string(),
            ],
            workflow_json: r#"{"trigger":"pr_opened","actions":["check_tests","check_docs","run_linters","comment_results"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-auto-deploy".to_string(),
            title: "Deploy to Staging on Merge".to_string(),
            description: "Automatically deploy to staging environment when PR is merged to main".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["ci/cd".to_string(), "deployment".to_string(), "automation".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 75.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Configure CI/CD pipeline\n2. Set up staging environment\n3. Define deployment triggers\n4. Add rollback mechanism".to_string(),
            sample_results: "Zero manual deployments, staging always up-to-date, 10x faster feedback loop".to_string(),
            success_stories: vec![
                "Startup deployed 50+ times per day with confidence".to_string(),
            ],
            workflow_json: r#"{"trigger":"pr_merged_main","actions":["run_tests","build_image","deploy_staging","notify_team"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-test-failure-notifier".to_string(),
            title: "Test Failure Slack Notifier".to_string(),
            description: "Alert the right developer immediately when their code breaks tests".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["testing".to_string(), "notifications".to_string(), "ci".to_string()],
            estimated_time_saved: 60,
            estimated_cost_saved: 50.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Integrate CI system\n2. Configure Slack webhook\n3. Map commits to developers\n4. Set notification preferences".to_string(),
            sample_results: "Test failures fixed 5x faster, reduced main branch downtime by 80%".to_string(),
            success_stories: vec![
                "Team maintained green builds 95% of the time".to_string(),
            ],
            workflow_json: r#"{"trigger":"test_failed","actions":["identify_culprit","send_slack_dm","create_issue_if_blocking"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-doc-generator".to_string(),
            title: "API Documentation Auto-Generator".to_string(),
            description: "Generate API documentation from code comments and OpenAPI specs automatically".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["documentation".to_string(), "api".to_string(), "automation".to_string()],
            estimated_time_saved: 200,
            estimated_cost_saved: 120.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Add code annotations\n2. Configure doc generator\n3. Set up hosting\n4. Enable auto-publish on merge".to_string(),
            sample_results: "Docs always in sync with code, 100% API coverage documented".to_string(),
            success_stories: vec![
                "API adoption increased 3x with comprehensive docs".to_string(),
            ],
            workflow_json: r#"{"trigger":"code_merged","actions":["parse_annotations","generate_docs","build_site","publish"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-dependency-updater".to_string(),
            title: "Dependency Security Updater".to_string(),
            description: "Automatically create PRs for security updates and minor version bumps".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["security".to_string(), "dependencies".to_string(), "maintenance".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 150.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Configure dependency scanner\n2. Set update policies\n3. Enable auto-PR creation\n4. Define approval rules".to_string(),
            sample_results: "Zero security vulnerabilities older than 24 hours, 50% reduction in technical debt".to_string(),
            success_stories: vec![
                "Company passed security audit with zero critical findings".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily","actions":["scan_vulnerabilities","create_update_pr","run_tests","auto_merge_if_green"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-issue-triage".to_string(),
            title: "GitHub Issue Auto-Triager".to_string(),
            description: "Label, prioritize, and assign issues automatically based on content".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["github".to_string(), "issues".to_string(), "triage".to_string()],
            estimated_time_saved: 100,
            estimated_cost_saved: 60.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect GitHub\n2. Define labeling rules\n3. Set priority criteria\n4. Configure assignment logic".to_string(),
            sample_results: "100% of issues triaged within 5 minutes, 40% faster issue resolution".to_string(),
            success_stories: vec![
                "Open source project maintained 24-hour response time with volunteers".to_string(),
            ],
            workflow_json: r#"{"trigger":"issue_opened","actions":["classify_type","set_priority","add_labels","assign_owner"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-performance-monitor".to_string(),
            title: "Performance Regression Detector".to_string(),
            description: "Run performance benchmarks on every commit and alert on regressions".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["performance".to_string(), "monitoring".to_string(), "benchmarks".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 200.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Set up benchmark suite\n2. Configure baseline metrics\n3. Define regression thresholds\n4. Create alert system".to_string(),
            sample_results: "Caught performance regressions before production, maintained sub-100ms response times".to_string(),
            success_stories: vec![
                "SaaS app stayed fast while scaling from 100 to 10,000 users".to_string(),
            ],
            workflow_json: r#"{"trigger":"pr_opened","actions":["run_benchmarks","compare_baseline","flag_if_slower","comment_results"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-changelog-generator".to_string(),
            title: "Release Changelog Generator".to_string(),
            description: "Generate changelogs from commit messages and PR descriptions automatically".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["changelog".to_string(), "releases".to_string(), "documentation".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 50.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Configure commit message format\n2. Set up changelog template\n3. Define version tagging\n4. Enable auto-generation on release".to_string(),
            sample_results: "Professional changelogs for every release, zero manual effort".to_string(),
            success_stories: vec![
                "Users loved transparent changelog, increased trust in product".to_string(),
            ],
            workflow_json: r#"{"trigger":"release_created","actions":["collect_commits","categorize_changes","generate_changelog","publish"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-code-owner-notifier".to_string(),
            title: "Code Owner Auto-Reviewer".to_string(),
            description: "Automatically request reviews from code owners based on changed files".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["code review".to_string(), "github".to_string(), "ownership".to_string()],
            estimated_time_saved: 60,
            estimated_cost_saved: 40.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Create CODEOWNERS file\n2. Configure auto-review requests\n3. Set up reviewer rotation\n4. Define review SLAs".to_string(),
            sample_results: "Reviews requested from right people 100% of the time, 30% faster reviews".to_string(),
            success_stories: vec![
                "Distributed team scaled code review process from 5 to 50 engineers".to_string(),
            ],
            workflow_json: r#"{"trigger":"pr_opened","actions":["parse_changed_files","find_owners","request_reviews"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "dev-stale-branch-cleaner".to_string(),
            title: "Stale Branch Cleanup Bot".to_string(),
            description: "Automatically close stale PRs and delete merged branches".to_string(),
            category: WorkflowCategory::Development,
            tags: vec!["cleanup".to_string(), "maintenance".to_string(), "git".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 60.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Define staleness criteria\n2. Set up warning notifications\n3. Configure auto-close rules\n4. Enable branch deletion".to_string(),
            sample_results: "Repository stayed clean with <10 open PRs, reduced clutter by 90%".to_string(),
            success_stories: vec![
                "Team easily found relevant PRs without digging through 200+ stale ones".to_string(),
            ],
            workflow_json: r#"{"trigger":"weekly","actions":["find_stale_prs","notify_authors","close_if_30_days","delete_merged_branches"]}"#.to_string(),
        },

        // ===== OPERATIONS (10 templates) =====
        WorkflowTemplate {
            id: "ops-invoice-processor".to_string(),
            title: "Invoice Receipt Processor".to_string(),
            description: "Extract data from invoice PDFs and create accounting entries automatically".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["invoices".to_string(), "accounting".to_string(), "ocr".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 120.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect email for invoice receipt\n2. Configure OCR extraction\n3. Map to accounting system\n4. Set up approval workflow".to_string(),
            sample_results: "Process 100 invoices per hour vs 10 manually, 99% accuracy".to_string(),
            success_stories: vec![
                "Accounting team eliminated 20 hours/week of data entry".to_string(),
            ],
            workflow_json: r#"{"trigger":"email_invoice_received","actions":["extract_data","validate","create_entry","notify_approver"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-expense-report".to_string(),
            title: "Expense Report Generator".to_string(),
            description: "Automatically categorize expenses from receipts and generate reports".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["expenses".to_string(), "receipts".to_string(), "reports".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 90.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Connect expense system\n2. Set up receipt capture\n3. Configure categories\n4. Define approval rules".to_string(),
            sample_results: "Expense reports submitted 10x faster, policy compliance improved 95%".to_string(),
            success_stories: vec![
                "Employees loved simplified expense process, 100% adoption".to_string(),
            ],
            workflow_json: r#"{"trigger":"receipt_uploaded","actions":["extract_amount","categorize","add_to_report","submit_if_complete"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-meeting-scheduler".to_string(),
            title: "AI Meeting Scheduler".to_string(),
            description: "Find optimal meeting times across calendars and book automatically".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["meetings".to_string(), "calendar".to_string(), "scheduling".to_string()],
            estimated_time_saved: 200,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect calendars\n2. Set availability preferences\n3. Configure booking rules\n4. Enable auto-send invites".to_string(),
            sample_results: "Eliminated 50+ back-and-forth emails per week, meetings scheduled in seconds".to_string(),
            success_stories: vec![
                "Executive assistant scheduled 100 meetings per week automatically".to_string(),
            ],
            workflow_json: r#"{"trigger":"meeting_request","actions":["check_availability","find_optimal_time","book_room","send_invites"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-standup-compiler".to_string(),
            title: "Daily Standup Report Compiler".to_string(),
            description: "Collect async standup updates and compile into team digest".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["standup".to_string(), "team".to_string(), "async".to_string()],
            estimated_time_saved: 100,
            estimated_cost_saved: 75.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Set up Slack bot\n2. Define standup questions\n3. Configure digest timing\n4. Enable team notifications".to_string(),
            sample_results: "Saved 30 minutes per day of meeting time, better async transparency".to_string(),
            success_stories: vec![
                "Remote team stayed aligned without timezone-conflicted meetings".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily_9am","actions":["request_updates","collect_responses","compile_digest","post_to_channel"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-onboarding-automation".to_string(),
            title: "New Employee Onboarding Automation".to_string(),
            description: "Provision accounts, send welcome materials, and schedule trainings automatically".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["onboarding".to_string(), "hr".to_string(), "provisioning".to_string()],
            estimated_time_saved: 300,
            estimated_cost_saved: 200.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Connect HR system\n2. Configure account provisioning\n3. Create onboarding checklist\n4. Set up training schedules".to_string(),
            sample_results: "New hires productive on day 1, zero forgotten setup steps, 5-star onboarding experience".to_string(),
            success_stories: vec![
                "Company scaled from 20 to 200 employees with same HR team".to_string(),
            ],
            workflow_json: r#"{"trigger":"employee_hired","actions":["create_accounts","send_welcome","schedule_trainings","assign_buddy"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-contract-reminder".to_string(),
            title: "Contract Renewal Reminder System".to_string(),
            description: "Track contract expiration dates and alert stakeholders in advance".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["contracts".to_string(), "renewals".to_string(), "alerts".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 500.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Import contract list\n2. Set reminder schedules\n3. Configure stakeholder notifications\n4. Add renewal workflow".to_string(),
            sample_results: "Zero missed renewals, negotiated better terms with 90-day notice".to_string(),
            success_stories: vec![
                "Saved $100K by not auto-renewing unused software licenses".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily","actions":["check_expiration_dates","send_90day_notice","send_30day_notice","send_7day_alert"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-inventory-monitor".to_string(),
            title: "Inventory Low Stock Alert System".to_string(),
            description: "Monitor inventory levels and automatically reorder when stock is low".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["inventory".to_string(), "reordering".to_string(), "supply chain".to_string()],
            estimated_time_saved: 200,
            estimated_cost_saved: 300.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect inventory system\n2. Set reorder points\n3. Configure supplier integration\n4. Enable auto-reordering".to_string(),
            sample_results: "Zero stockouts, 40% reduction in excess inventory, optimized cash flow".to_string(),
            success_stories: vec![
                "E-commerce business maintained 99.5% product availability".to_string(),
            ],
            workflow_json: r#"{"trigger":"inventory_updated","actions":["check_levels","alert_if_low","create_po_if_critical","notify_supplier"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-compliance-checker".to_string(),
            title: "Compliance Documentation Checker".to_string(),
            description: "Verify required compliance documents are up-to-date and alert before expiration".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["compliance".to_string(), "documentation".to_string(), "alerts".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 1000.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Define compliance requirements\n2. Upload current documents\n3. Set expiration tracking\n4. Configure renewal reminders".to_string(),
            sample_results: "Passed all audits, zero compliance lapses, avoided potential $50K fines".to_string(),
            success_stories: vec![
                "Healthcare company maintained HIPAA compliance effortlessly".to_string(),
            ],
            workflow_json: r#"{"trigger":"weekly","actions":["check_document_dates","verify_requirements","alert_if_expiring","generate_compliance_report"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-shift-scheduler".to_string(),
            title: "Employee Shift Scheduler".to_string(),
            description: "Optimize employee shift schedules based on availability and business needs".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["scheduling".to_string(), "workforce".to_string(), "optimization".to_string()],
            estimated_time_saved: 240,
            estimated_cost_saved: 150.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Import employee availability\n2. Define business requirements\n3. Configure optimization rules\n4. Enable auto-publish schedules".to_string(),
            sample_results: "Fair schedules generated in minutes vs days, 30% better coverage, happier employees".to_string(),
            success_stories: vec![
                "Retail store reduced scheduling conflicts by 90%".to_string(),
            ],
            workflow_json: r#"{"trigger":"weekly_thursday","actions":["collect_availability","optimize_shifts","check_coverage","publish_schedule"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "ops-equipment-maintenance".to_string(),
            title: "Equipment Maintenance Tracker".to_string(),
            description: "Schedule preventive maintenance and track equipment service history".to_string(),
            category: WorkflowCategory::Operations,
            tags: vec!["maintenance".to_string(), "equipment".to_string(), "tracking".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 500.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Create equipment inventory\n2. Define maintenance schedules\n3. Configure work order creation\n4. Set up vendor notifications".to_string(),
            sample_results: "80% reduction in equipment downtime, extended equipment lifespan by 40%".to_string(),
            success_stories: vec![
                "Manufacturing plant avoided $250K in emergency repairs".to_string(),
            ],
            workflow_json: r#"{"trigger":"maintenance_due","actions":["create_work_order","assign_technician","notify_vendor","track_completion"]}"#.to_string(),
        },

        // ===== PERSONAL PRODUCTIVITY (15 templates) =====
        WorkflowTemplate {
            id: "pp-inbox-zero".to_string(),
            title: "Inbox Zero Automator".to_string(),
            description: "Automatically categorize, archive, and prioritize emails to achieve inbox zero".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["email".to_string(), "productivity".to_string(), "organization".to_string()],
            estimated_time_saved: 240,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect email account\n2. Train email classifier\n3. Set up auto-categorization\n4. Define priority rules".to_string(),
            sample_results: "Process 200 emails in 10 minutes, maintain inbox zero daily, never miss important emails".to_string(),
            success_stories: vec![
                "Executive cleared 5,000-email backlog and maintained inbox zero".to_string(),
            ],
            workflow_json: r#"{"trigger":"email_received","actions":["classify_type","set_priority","auto_archive_if_low_priority","add_to_todo_if_action"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-calendar-optimizer".to_string(),
            title: "Smart Calendar Optimizer".to_string(),
            description: "Optimize calendar to block focus time, prevent meeting overload, and suggest better schedules".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["calendar".to_string(), "time management".to_string(), "focus".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 90.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Connect calendar\n2. Define focus time preferences\n3. Set meeting limits\n4. Enable auto-blocking".to_string(),
            sample_results: "4 hours of focus time per day guaranteed, 40% fewer meetings, 3x productivity".to_string(),
            success_stories: vec![
                "Manager reclaimed 15 hours per week for deep work".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily","actions":["analyze_calendar","block_focus_time","suggest_meeting_consolidation","protect_lunch"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-task-prioritizer".to_string(),
            title: "AI Task Prioritizer".to_string(),
            description: "Automatically prioritize todo list based on deadlines, importance, and dependencies".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["tasks".to_string(), "prioritization".to_string(), "planning".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 60.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect task manager\n2. Define priority criteria\n3. Enable auto-reordering\n4. Set up daily plan generation".to_string(),
            sample_results: "Always work on the right thing, complete 50% more important tasks, reduce decision fatigue".to_string(),
            success_stories: vec![
                "Product manager shipped 3 major features in a quarter vs usual 1".to_string(),
            ],
            workflow_json: r#"{"trigger":"task_added_or_daily","actions":["score_importance","check_deadlines","analyze_dependencies","reorder_list"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-research-assistant".to_string(),
            title: "AI Research Assistant".to_string(),
            description: "Automatically collect, summarize, and organize research from multiple sources".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["research".to_string(), "information".to_string(), "ai".to_string()],
            estimated_time_saved: 300,
            estimated_cost_saved: 150.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Define research topics\n2. Configure source feeds\n3. Set up summarization\n4. Organize into knowledge base".to_string(),
            sample_results: "Research time reduced from 4 hours to 30 minutes, 5x more comprehensive insights".to_string(),
            success_stories: vec![
                "Analyst created weekly market reports 10x faster".to_string(),
            ],
            workflow_json: r#"{"trigger":"research_query","actions":["search_sources","extract_relevant","summarize","organize","create_report"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-reading-list-curator".to_string(),
            title: "Smart Reading List Curator".to_string(),
            description: "Curate personalized reading list from favorite sources and schedule reading time".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["reading".to_string(), "learning".to_string(), "curation".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 40.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Add content sources\n2. Set reading preferences\n3. Configure delivery schedule\n4. Enable progress tracking".to_string(),
            sample_results: "Read 3x more high-quality content, stay informed with 30 minutes per day".to_string(),
            success_stories: vec![
                "Professional stayed current in their field with minimal time investment".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily_morning","actions":["fetch_articles","rank_relevance","create_digest","schedule_reading_time"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-meeting-note-taker".to_string(),
            title: "Automated Meeting Notes & Actions".to_string(),
            description: "Transcribe meetings, extract action items, and send follow-up emails automatically".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["meetings".to_string(), "notes".to_string(), "transcription".to_string()],
            estimated_time_saved: 180,
            estimated_cost_saved: 90.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect meeting platform\n2. Enable transcription\n3. Configure action item detection\n4. Set up auto-follow-ups".to_string(),
            sample_results: "Never take notes manually again, 100% action item capture, instant meeting summaries".to_string(),
            success_stories: vec![
                "Team actually followed through on meeting action items".to_string(),
            ],
            workflow_json: r#"{"trigger":"meeting_ended","actions":["transcribe","extract_actions","generate_summary","send_followup"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-habit-tracker".to_string(),
            title: "Smart Habit Tracker & Reminder".to_string(),
            description: "Track habits, send reminders at optimal times, and provide motivation".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["habits".to_string(), "reminders".to_string(), "self-improvement".to_string()],
            estimated_time_saved: 60,
            estimated_cost_saved: 30.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Define habits to track\n2. Set reminder timing\n3. Configure tracking method\n4. Enable streak visualization".to_string(),
            sample_results: "80% habit completion rate, built 5 new lasting habits in 3 months".to_string(),
            success_stories: vec![
                "User lost 30 lbs by tracking exercise and meal habits consistently".to_string(),
            ],
            workflow_json: r#"{"trigger":"optimal_time","actions":["send_reminder","track_completion","update_streak","provide_encouragement"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-expense-tracker".to_string(),
            title: "Personal Expense Tracker".to_string(),
            description: "Automatically categorize personal expenses from bank transactions and track spending".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["finance".to_string(), "budgeting".to_string(), "expenses".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 50.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect bank accounts\n2. Define spending categories\n3. Set budget limits\n4. Configure alerts".to_string(),
            sample_results: "Complete spending visibility, saved $500/month by cutting unnecessary expenses".to_string(),
            success_stories: vec![
                "Family achieved financial goals 2 years ahead of schedule".to_string(),
            ],
            workflow_json: r#"{"trigger":"transaction_posted","actions":["categorize","update_budget","alert_if_over","generate_insights"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-travel-planner".to_string(),
            title: "Automatic Travel Itinerary Organizer".to_string(),
            description: "Collect flight, hotel, and activity confirmations into organized travel itinerary".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["travel".to_string(), "organization".to_string(), "itinerary".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 40.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Forward booking emails\n2. Auto-extract details\n3. Create calendar events\n4. Generate itinerary document".to_string(),
            sample_results: "Never miss a flight again, all travel details in one place, stress-free travel".to_string(),
            success_stories: vec![
                "Frequent traveler managed 50+ trips per year effortlessly".to_string(),
            ],
            workflow_json: r#"{"trigger":"booking_email_received","actions":["extract_details","add_to_calendar","build_itinerary","set_reminders"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-document-organizer".to_string(),
            title: "Smart Document Organizer".to_string(),
            description: "Automatically organize, rename, and tag documents into proper folders".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["documents".to_string(), "organization".to_string(), "filing".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 60.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Define folder structure\n2. Set up auto-watch folders\n3. Configure naming rules\n4. Enable OCR for scanned docs".to_string(),
            sample_results: "Find any document in seconds, never manually file again, 100% organized".to_string(),
            success_stories: vec![
                "Homeowner organized 10 years of documents in one weekend".to_string(),
            ],
            workflow_json: r#"{"trigger":"document_added","actions":["analyze_content","categorize","rename","move_to_folder","add_tags"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-password-auditor".to_string(),
            title: "Password Security Auditor".to_string(),
            description: "Check passwords for breaches, weak passwords, and duplicates across accounts".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["security".to_string(), "passwords".to_string(), "audit".to_string()],
            estimated_time_saved: 120,
            estimated_cost_saved: 500.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Connect password manager\n2. Enable breach checking\n3. Set strength requirements\n4. Configure change reminders".to_string(),
            sample_results: "Zero compromised passwords, all accounts secured, protected from identity theft".to_string(),
            success_stories: vec![
                "User avoided $5K fraud by catching compromised password early".to_string(),
            ],
            workflow_json: r#"{"trigger":"weekly","actions":["check_breaches","audit_strength","find_duplicates","remind_to_update"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-social-media-cleanup".to_string(),
            title: "Social Media Cleanup Assistant".to_string(),
            description: "Find and delete old embarrassing posts, clean up followers, and audit privacy".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["social media".to_string(), "privacy".to_string(), "cleanup".to_string()],
            estimated_time_saved: 200,
            estimated_cost_saved: 80.0,
            difficulty: TemplateDifficulty::Advanced,
            setup_instructions: "1. Connect social accounts\n2. Define cleanup criteria\n3. Review suggested deletions\n4. Enable auto-cleanup".to_string(),
            sample_results: "Removed 5,000+ old posts in minutes, improved online presence, better privacy".to_string(),
            success_stories: vec![
                "Job seeker cleaned up social media before interviews, landed dream job".to_string(),
            ],
            workflow_json: r#"{"trigger":"monthly","actions":["scan_old_posts","flag_risky_content","suggest_deletions","audit_privacy"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-health-data-aggregator".to_string(),
            title: "Health Data Aggregator & Tracker".to_string(),
            description: "Collect health data from multiple sources (Fitbit, Apple Health) into unified dashboard".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["health".to_string(), "fitness".to_string(), "tracking".to_string()],
            estimated_time_saved: 60,
            estimated_cost_saved: 30.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Connect health devices\n2. Define metrics to track\n3. Set health goals\n4. Configure insights generation".to_string(),
            sample_results: "Complete health picture in one place, data-driven health improvements".to_string(),
            success_stories: vec![
                "User lost 40 lbs by tracking comprehensive health metrics".to_string(),
            ],
            workflow_json: r#"{"trigger":"daily","actions":["sync_devices","aggregate_metrics","check_goals","provide_insights"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-subscription-manager".to_string(),
            title: "Subscription Tracker & Canceller".to_string(),
            description: "Track all subscriptions, alert before renewals, and help cancel unwanted services".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["subscriptions".to_string(), "finance".to_string(), "management".to_string()],
            estimated_time_saved: 90,
            estimated_cost_saved: 300.0,
            difficulty: TemplateDifficulty::Beginner,
            setup_instructions: "1. Import bank transactions\n2. Detect recurring charges\n3. Set renewal alerts\n4. Add cancellation guides".to_string(),
            sample_results: "Saved $1,200/year by cancelling forgotten subscriptions, full visibility of all services".to_string(),
            success_stories: vec![
                "Family discovered $250/month in forgotten subscriptions and cancelled them".to_string(),
            ],
            workflow_json: r#"{"trigger":"monthly","actions":["scan_transactions","detect_subscriptions","alert_renewals","suggest_cancellations"]}"#.to_string(),
        },

        WorkflowTemplate {
            id: "pp-meal-planner".to_string(),
            title: "AI Meal Planner & Grocery List".to_string(),
            description: "Generate weekly meal plans based on preferences and automatically create grocery lists".to_string(),
            category: WorkflowCategory::PersonalProductivity,
            tags: vec!["meals".to_string(), "planning".to_string(), "groceries".to_string()],
            estimated_time_saved: 150,
            estimated_cost_saved: 100.0,
            difficulty: TemplateDifficulty::Intermediate,
            setup_instructions: "1. Define dietary preferences\n2. Set budget constraints\n3. Configure meal diversity\n4. Enable grocery list generation".to_string(),
            sample_results: "Eliminated 'what's for dinner' stress, healthier eating, saved 5 hours per week".to_string(),
            success_stories: vec![
                "Busy parent saved $400/month by reducing restaurant visits".to_string(),
            ],
            workflow_json: r#"{"trigger":"weekly_sunday","actions":["generate_meal_plan","create_grocery_list","check_pantry","send_reminders"]}"#.to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_template_count() {
        let templates = get_all_templates();
        assert!(templates.len() >= 50, "Should have at least 50 templates");
    }

    #[test]
    fn test_template_categories() {
        let templates = get_all_templates();
        let categories: std::collections::HashSet<_> = templates.iter()
            .map(|t| t.category.clone())
            .collect();

        assert!(categories.contains(&WorkflowCategory::CustomerSupport));
        assert!(categories.contains(&WorkflowCategory::SalesMarketing));
        assert!(categories.contains(&WorkflowCategory::Development));
        assert!(categories.contains(&WorkflowCategory::Operations));
        assert!(categories.contains(&WorkflowCategory::PersonalProductivity));
    }
}
