/**
 * Onboarding Welcome Screen
 *
 * A friendly welcome screen for first-time users that explains
 * the app in simple, non-technical terms.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Sparkles,
  Shield,
  Zap,
  ArrowRight,
  Check,
  Globe,
  Code,
  FileText,
  Image,
} from 'lucide-react';
import { useSimpleModeStore } from '../../stores/ui';
import { cn } from '../../lib/utils';

interface OnboardingWelcomeProps {
  onComplete: () => void;
}

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to AGI Workforce!',
    subtitle: 'Your autonomous AI that helps you get things done.',
    icon: Sparkles,
    color: 'from-purple-500 to-indigo-500',
  },
  {
    id: 'capabilities',
    title: 'What can AGI Workforce do?',
    subtitle: 'Just ask naturally - like talking to a helpful colleague.',
    icon: MessageSquare,
    color: 'from-blue-500 to-cyan-500',
    features: [
      {
        icon: Globe,
        label: 'Research anything online',
        description: 'I can search and summarize information for you',
      },
      {
        icon: FileText,
        label: 'Write & edit content',
        description: 'Emails, reports, summaries, and more',
      },
      {
        icon: Code,
        label: 'Help with technical tasks',
        description: 'Code, data analysis, troubleshooting',
      },
      {
        icon: Image,
        label: 'Analyze images & documents',
        description: 'Just drag and drop files into the chat',
      },
    ],
  },
  {
    id: 'simple',
    title: 'We keep it simple',
    subtitle: 'No complicated settings. Just type and let me handle the rest.',
    icon: Shield,
    color: 'from-green-500 to-emerald-500',
    features: [
      {
        icon: Sparkles,
        label: 'Smart by default',
        description: 'I automatically choose the best way to help',
      },
      { icon: Zap, label: 'Fast responses', description: 'Get answers quickly without waiting' },
      {
        icon: Check,
        label: 'Safe & secure',
        description: 'Your conversations are private and protected',
      },
    ],
  },
];

export const OnboardingWelcome: React.FC<OnboardingWelcomeProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const completeOnboarding = useSimpleModeStore((state) => state.completeOnboarding);

  const handleComplete = () => {
    completeOnboarding();
    onComplete();
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg mx-4"
      >
        <div className="bg-white dark:bg-charcoal-900 rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-gray-200 dark:bg-gray-800">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step?.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-8"
            >
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div
                  className={cn(
                    'w-20 h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br',
                    step?.color,
                  )}
                >
                  {step?.icon && <step.icon className="w-10 h-10 text-white" />}
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
                {step?.title}
              </h2>
              <p className="text-center text-gray-600 dark:text-gray-400 mb-8">{step?.subtitle}</p>

              {/* Features (if any) */}
              {step?.features && (
                <div className="space-y-4 mb-8">
                  {step.features.map((feature, index) => (
                    <motion.div
                      key={feature.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start gap-4 p-3 rounded-xl bg-gray-50 dark:bg-charcoal-800"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <feature.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {feature.label}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {feature.description}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {STEPS.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      className={cn(
                        'w-2 h-2 rounded-full transition-all',
                        index === currentStep
                          ? 'w-6 bg-primary'
                          : 'bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600',
                      )}
                    />
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  className={cn(
                    'flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all',
                    'bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90',
                    'shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30',
                  )}
                >
                  {isLastStep ? (
                    <>
                      Get Started
                      <Check className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Skip button */}
              <button
                onClick={handleComplete}
                className="w-full mt-4 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                Skip for now
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingWelcome;
