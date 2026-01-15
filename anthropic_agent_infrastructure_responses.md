# Anthropic Senior/Staff Software Engineer - Autonomous Agent Infrastructure

## Application Responses - Siddhartha Nagula

---

## 1. Why Anthropic? (200-400 words)

I want to work at Anthropic because I've been building autonomous agent infrastructure independently—and I want to build it at the scale and rigor that only Anthropic can offer.

For the past year, I've architected AGI Workforce, a production platform where AI agents execute code, manage files, call APIs, and complete multi-step tasks autonomously. The infrastructure challenges I've solved mirror exactly what this role describes: execution environments with safety boundaries, state management for long-running tasks, checkpointing and recovery, multi-agent orchestration, and observability into what agents actually do.

My system runs 150+ specialized agents in production. The Rust backend includes a goal-based execution engine with configurable constraints (max iterations, timeouts, failure limits), a hierarchical task planner with sub-goal decomposition, and a learning system that tracks success rates per execution type. I built state persistence in SQLite with WAL mode, credential storage via OS keyring with AES-GCM encryption, and security boundaries including JWT auth, rate limiting (Upstash Redis with failClosed mode), row-level security, and scoped permissions.

But I also know where my infrastructure falls short. My isolation is process-level, not VM-level. I've studied how Anthropic's Cowork uses Apple Virtualization Framework for stronger sandboxing. I understand the tradeoffs between security and capability, and I want to work on systems where getting this right matters at scale—where the infrastructure decisions affect millions of users and the safety implications are real.

What excites me about this role specifically is that it's greenfield. The job description says "you'll help define the architecture" and the problems "don't have existing playbooks." That's exactly where I thrive. Building AGI Workforce as a solo founder meant making architectural decisions under uncertainty every day—choosing Tauri over Electron, designing the agent execution loop, building the permission model from scratch. I'm comfortable with ambiguity because I've been living in it.

I want to bring what I've learned building agent infrastructure independently to a team that's defining how autonomous AI systems should work. Anthropic is where that future is being built.

---

## 2. Additional Information / Cover Letter

**Relevant Infrastructure Experience:**

I've built production agent infrastructure that directly maps to this role's responsibilities:

**Execution Environments & Safety Boundaries:**
Built a Rust backend (294K lines) where agents execute code, access tools, and interact with external services. Implemented security boundaries including OS keyring integration, AES-GCM encryption, JWT authentication with rotation, rate limiting (Upstash Redis, failClosed mode), row-level security (Supabase RLS), input validation (Zod schemas), and CSP headers restricted to approved domains.

**State Management for Long-Running Tasks:**
Designed state persistence using SQLite (WAL mode, 64MB cache) for agent execution. Built checkpointing through a task persistence system, memory management with contextual preservation and automatic compaction, and 39 Zustand state stores with middleware for frontend state coordination.

**Multi-Agent Orchestration:**
Architected a system orchestrating 150+ specialized agents with parallel execution, resource coordination, and conflict resolution. The hierarchical task planner handles sub-goal decomposition with depth-limited planning and priority management.

**Observability & Debugging:**
Built execution tracking with outcome analytics per process type, success rate metrics, exportable run timelines, and a learning system that improves strategies based on results.

**Cloud Infrastructure:**
Google Cloud Certified Associate Cloud Engineer. Production experience with GCP (Compute, IAM, BigQuery, Vertex AI, Kubernetes, Cloud Functions), AWS (SageMaker, EC2, S3), Supabase, Vercel, and serverless architectures. Built CI/CD pipelines, application packaging, and deployment automation.

**Technical Stack Alignment:**

- Languages: Rust (294K lines production), Python, TypeScript, Go familiarity
- Databases: SQLite, PostgreSQL, MongoDB, MySQL, Redis
- Infrastructure: Docker, Kubernetes, Terraform, serverless
- Workflow patterns: Built custom orchestration with execution constraints (max iterations: 1,000, timeout: 5 min, failure limit: 3)

**What I Want to Learn:**
I'm genuinely excited to go deeper on sandboxing technologies I haven't used in production: gVisor, Firecracker, V8 isolates. My current isolation is process-level; I want to build VM-level security at scale. I'm also eager to work with workflow orchestration systems like Temporal at production scale.

**Availability:**
MS Computer Science completed May 2025. Available immediately. Open to relocating to San Francisco, Seattle, or New York.

**Why I'm a Fit Despite Not Matching Every Requirement:**
The job description asks for 6+ years at hyperscale. I have 2+ years of intensive infrastructure work, but as a solo founder building a 465K-line production system, every year has been compressed. I've made more architectural decisions in isolation—without a team to lean on—than most engineers make in a decade. I'm ready to bring that intensity to Anthropic's scale.

---

_Application prepared January 2026_
