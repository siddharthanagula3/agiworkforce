# Anthropic Cross-functional Prompt Engineer

## Application Responses - Siddhartha Nagula

---

## 1. Why Anthropic? (200-400 words)

I want to work at Anthropic because I've spent the past year learning what makes Claude behave well—and badly—by building production systems that depend on it.

At AGI Workforce, I architected a platform orchestrating 150+ specialized AI agents, each with carefully crafted system prompts optimized for specific tasks. I've written prompts for code generation, document creation, browser automation, email composition, calendar management, and dozens of other domains. I've debugged behavioral issues in production: sycophancy that led to bad recommendations, refusals that blocked legitimate workflows, inconsistent formatting that broke downstream parsing. I've learned which problems are promptable and which require architectural changes.

This experience taught me something important: prompt engineering at scale isn't about clever tricks—it's about understanding what behaviors you actually want, measuring whether you're getting them, and building systems that make good behaviors reliable. My platform includes execution tracking with success rate analytics per agent type, which functions as a behavioral evaluation framework. When an agent's success rate drops, I investigate: is it a prompt issue, a model capability limit, or a changed user expectation?

What draws me to this role specifically is the scope. You're not looking for someone to optimize individual prompts—you're looking for someone to own Claude's behaviors across all products. That's the scale of impact I want. I've seen how small prompt changes cascade through systems. I've learned that consistency matters more than local optimization. And I care deeply about getting this right because I believe Claude's behaviors shape how millions of people understand what AI can and should be.

I'm also drawn to Anthropic's approach to safety. My own system includes scoped permissions, audit logging, and explicit user confirmations for sensitive actions—patterns I arrived at independently because they're the right way to build trustworthy AI. I want to work somewhere that takes these questions seriously at a foundational level.

I want to bring what I've learned from building production AI systems to Anthropic, where I can help shape Claude's behaviors at the source rather than working around them downstream.

---

## 2. Additional Information / Cover Letter

**Relevant Prompt Engineering Experience:**

I've built and maintained production prompt systems at scale, which directly maps to this role's responsibilities:

**System Prompts for Specialized Agents:**
Authored and maintained system prompts for 150+ specialized AI agents across AGI Workforce, each optimized for specific domains: code generation, document creation, browser automation, file management, database operations, email composition, calendar scheduling, and more. Each prompt required balancing capability with safety—enabling useful actions while preventing harmful ones.

**Multi-LLM Prompt Engineering:**
My platform supports OpenAI, Claude, Google Gemini, Ollama, and local models. I've written prompts that work across providers and learned which behavioral patterns are model-specific versus universal. This cross-model experience gives me perspective on Claude's unique strengths and quirks.

**Behavioral Evaluations:**
Built execution tracking with outcome analytics per agent type, functioning as a behavioral evaluation framework. Success rate metrics per process type help identify when prompts need refinement. The learning system tracks which prompt strategies work for which task categories.

**Production Incident Response:**
Debugged behavioral issues in production: sycophancy leading to poor recommendations, overly cautious refusals blocking legitimate workflows, inconsistent output formatting breaking downstream parsing, and context window management issues. I've developed intuition for what's promptable versus what requires architectural changes.

**Meta-Prompts and Orchestration:**
Built a hierarchical task planner that uses meta-prompts to decompose complex goals into sub-tasks, assign them to appropriate specialized agents, and coordinate execution. This required prompt engineering for both the orchestration layer and the individual agents.

**Safety-Conscious Design:**
Implemented permission systems, audit logging, and user confirmation flows—arriving at patterns similar to Claude's safety guidelines independently. I understand why these behaviors matter and how to prompt for them reliably.

**Technical Foundation:**

- Python proficiency (built data pipelines, evaluation scripts, API integrations)
- NVIDIA certification in Building LLM Applications with Prompt Engineering (RAG, LangChain, model tuning)
- Deep familiarity with Claude's API, behaviors, and capabilities from production usage
- Experience with LangChain, LlamaIndex, and prompt optimization techniques
- 250+ LeetCode hard problems solved—comfortable navigating complex codebases

**Cross-functional Collaboration:**

As a founder, I've worked across product, engineering, and business functions simultaneously. I've gathered user requirements, prioritized features, translated feedback into specifications, and shipped changes through production systems. I understand how to balance immediate product needs with long-term behavioral goals.

**Why I Care About This Work:**

I believe Claude's behaviors shape public understanding of what AI can and should be. Every system prompt decision—how Claude handles ambiguity, when it refuses, how it admits uncertainty—sets expectations for millions of users. I want to be part of making those decisions thoughtfully, ensuring Claude is genuinely helpful while remaining safe and honest.

**Availability:**

MS Computer Science completed May 2025. Available immediately. Open to travel as required and relocating to San Francisco, Seattle, or New York.

---

_Application prepared January 2026_
