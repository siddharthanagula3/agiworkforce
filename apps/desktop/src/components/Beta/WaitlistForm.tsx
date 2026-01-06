import { useActionState, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  User,
  Building,
  Briefcase,
  Sparkles,
  Check,
  Loader2,
  ArrowRight,
  Gift,
} from 'lucide-react';
import { waitlistService, type WaitlistEntry } from '../../services/waitlistService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Checkbox } from '../ui/Checkbox';
import { cn } from '../../lib/utils';

// React 19: Form state type for useActionState
interface WaitlistFormState {
  error: string | null;
  success: boolean;
  position: number | null;
}

interface WaitlistFormProps {
  referralCode?: string;
  onSuccess?: () => void;
  className?: string;
}

export function WaitlistForm({ referralCode, onSuccess, className }: WaitlistFormProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(true);

  // React 19: useActionState for form submission with built-in pending state
  const [formState, submitAction, isLoading] = useActionState<WaitlistFormState, FormData>(
    async (_prevState, formData) => {
      const email = formData.get('email') as string;
      const name = formData.get('name') as string;
      const company = formData.get('company') as string;
      const role = formData.get('role') as string;
      const useCase = formData.get('useCase') as string;

      const entry: WaitlistEntry = {
        email,
        name: name || undefined,
        company: company || undefined,
        role: role || undefined,
        useCase: useCase || undefined,
        referralCode: referralCode,
        marketingConsent,
      };

      const result = await waitlistService.joinWaitlist(entry);

      if (result.success) {
        const status = await waitlistService.checkWaitlistStatus(email);
        onSuccess?.();
        return {
          error: null,
          success: true,
          position: status.position ?? null,
        };
      } else {
        return {
          error: result.error || 'Something went wrong',
          success: false,
          position: null,
        };
      }
    },
    { error: null, success: false, position: null },
  );

  // React 19: Success state comes from formState
  if (formState.success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('text-center p-8', className)}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-6"
        >
          <Check className="w-10 h-10 text-green-500" />
        </motion.div>

        <h2 className="text-2xl font-bold mb-2">You're on the list!</h2>
        <p className="text-muted-foreground mb-4">
          Thanks for joining the AGI Workforce beta waitlist.
        </p>

        {formState.position && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 text-violet-500 font-medium mb-6"
          >
            <Sparkles className="w-4 h-4" />
            You're #{formState.position} on the waitlist
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="p-4 rounded-lg bg-muted/50 text-left"
        >
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Gift className="w-4 h-4 text-violet-500" />
            What's next?
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Check your email for confirmation</li>
            <li>• We'll notify you when it's your turn</li>
            <li>• Early access members get 50% off for 3 months</li>
          </ul>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {/* React 19: Using form action prop for native form submission handling */}
      <form action={submitAction} className="space-y-4">
        {}
        <div>
          <Label htmlFor="waitlist-email" className="text-sm font-medium">
            Email address <span className="text-destructive">*</span>
          </Label>
          <div className="relative mt-1.5">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="waitlist-email"
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              className="pl-10 h-11 bg-background/50"
            />
          </div>
        </div>

        {}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {showDetails ? '- Hide details' : '+ Add more details (optional)'}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              {}
              <div>
                <Label htmlFor="waitlist-name" className="text-sm font-medium">
                  Full name
                </Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="waitlist-name"
                    name="name"
                    type="text"
                    placeholder="John Doe"
                    className="pl-10 h-11 bg-background/50"
                  />
                </div>
              </div>

              {}
              <div>
                <Label htmlFor="waitlist-company" className="text-sm font-medium">
                  Company
                </Label>
                <div className="relative mt-1.5">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="waitlist-company"
                    name="company"
                    type="text"
                    placeholder="Acme Inc."
                    className="pl-10 h-11 bg-background/50"
                  />
                </div>
              </div>

              {}
              <div>
                <Label htmlFor="waitlist-role" className="text-sm font-medium">
                  Role
                </Label>
                <div className="relative mt-1.5">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="waitlist-role"
                    name="role"
                    type="text"
                    placeholder="Product Manager"
                    className="pl-10 h-11 bg-background/50"
                  />
                </div>
              </div>

              {}
              <div>
                <Label htmlFor="waitlist-usecase" className="text-sm font-medium">
                  What would you automate?
                </Label>
                <textarea
                  id="waitlist-usecase"
                  name="useCase"
                  placeholder="Tell us about your automation needs..."
                  rows={3}
                  className="mt-1.5 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {}
        <div className="flex items-start gap-3">
          <Checkbox
            id="marketing-consent"
            checked={marketingConsent}
            onCheckedChange={(checked) => setMarketingConsent(checked === true)}
          />
          <label
            htmlFor="marketing-consent"
            className="text-sm text-muted-foreground leading-tight cursor-pointer"
          >
            Send me product updates and tips. You can unsubscribe at any time.
          </label>
        </div>

        {}
        {/* React 19: Error state comes from formState */}
        <AnimatePresence>
          {formState.error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            >
              {formState.error}
            </motion.div>
          )}
        </AnimatePresence>

        {}
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-11 bg-linear-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white border-0"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Join the Waitlist
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>

        {referralCode && (
          <p className="text-center text-xs text-muted-foreground">
            Referred by code: <span className="font-mono font-medium">{referralCode}</span>
          </p>
        )}
      </form>
    </div>
  );
}

export default WaitlistForm;
