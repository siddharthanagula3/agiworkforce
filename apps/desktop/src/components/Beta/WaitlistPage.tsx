import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, Shield, Bot, Clock, Users, Gift, ArrowRight, Check } from 'lucide-react';
import { WaitlistForm } from './WaitlistForm';
import { BetaInviteCode } from './BetaInviteCode';
import { Button } from '../ui/Button';

interface WaitlistPageProps {
  referralCode?: string;
}

const features = [
  {
    icon: Bot,
    title: 'AI-Powered Agents',
    description: 'Create autonomous AI agents that understand context and execute complex tasks.',
  },
  {
    icon: Zap,
    title: 'Multi-Tool Automation',
    description: 'Connect to 100+ tools and services. Automate across your entire workflow.',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your data stays local. Enterprise-grade security with full control.',
  },
  {
    icon: Clock,
    title: 'Save 10+ Hours/Week',
    description: 'Automate repetitive tasks and focus on what matters most.',
  },
];

const benefits = [
  '50% off for the first 3 months',
  'Extended 30-day free trial',
  'Priority access to new features',
  'Direct line to the founding team',
  'Shape the product roadmap',
];

export function WaitlistPage({ referralCode }: WaitlistPageProps) {
  const [showInviteCode, setShowInviteCode] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {}
      <div className="relative overflow-hidden">
        {}
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.4, 0.3],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-3xl"
          />
          <motion.div
            animate={{
              scale: [1.1, 1, 1.1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-fuchsia-500/20 rounded-full blur-3xl"
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-24">
          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 mb-8"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold">AGI Workforce</span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
              BETA
            </span>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center max-w-3xl mx-auto mb-12"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              The Future of Work is
              <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
                {' '}
                Autonomous
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground">
              Join the waitlist for early access to AI agents that automate your most complex
              workflows. Work smarter, not harder.
            </p>
          </motion.div>

          {}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-md mx-auto"
          >
            <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl">
              {!showInviteCode ? (
                <>
                  <WaitlistForm referralCode={referralCode} />

                  <div className="mt-4 pt-4 border-t border-border/50">
                    <button
                      onClick={() => setShowInviteCode(true)}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
                    >
                      <Gift className="w-4 h-4" />
                      Have an invite code?
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <BetaInviteCode />

                  <div className="mt-4 pt-4 border-t border-border/50">
                    <button
                      onClick={() => setShowInviteCode(false)}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back to waitlist signup
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {}
      <div className="py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Early Access Benefits</h2>
            <p className="text-muted-foreground">
              Join now and get exclusive perks as a founding member.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 max-w-4xl mx-auto">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border/50"
              >
                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-green-500" />
                </div>
                <span className="text-sm">{benefit}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {}
      <div className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4">What You'll Get Access To</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              AGI Workforce is the most powerful AI automation platform for professionals who want
              to 10x their productivity.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-xl bg-card border border-border/50 hover:border-violet-500/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-violet-500" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {}
      <div className="py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center justify-center gap-4 mb-6"
          >
            <div className="flex -space-x-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 border-2 border-background"
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">2,500+</strong> on the waitlist
              </span>
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground"
          >
            Join professionals from Google, Meta, Microsoft, and more.
          </motion.p>
        </div>
      </div>

      {}
      <div className="py-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Ready to Transform Your Workflow?
            </h2>
            <p className="text-muted-foreground mb-8">
              Don't miss out on early access. The beta is limited to ensure the best experience for
              our founding members.
            </p>
            <Button
              size="lg"
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white border-0"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Join the Waitlist
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </div>
      </div>

      {}
      <div className="py-8 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 AGI Workforce. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default WaitlistPage;
