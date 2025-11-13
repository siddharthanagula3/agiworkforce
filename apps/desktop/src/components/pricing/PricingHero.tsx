import { Shield, XCircle, DollarSign } from 'lucide-react';
import { Badge } from '../ui/Badge';

export function PricingHero() {
  return (
    <div className="bg-gradient-to-b from-primary/5 to-background border-b border-border/60">
      <div className="container mx-auto px-6 py-12">
        {/* Main Heading */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Pay Only for Results</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No risk. Only pay when automations succeed. Failed automations are always free.
          </p>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-sm">ROI Guarantee</div>
              <div className="text-xs text-muted-foreground">Enterprise plans</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-sm">Cancel Anytime</div>
              <div className="text-xs text-muted-foreground">No lock-in</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-sm">No Hidden Fees</div>
              <div className="text-xs text-muted-foreground">100% transparent</div>
            </div>
          </div>
        </div>

        {/* ROI Badge */}
        <div className="flex justify-center mt-6">
          <Badge variant="outline" className="text-sm px-4 py-2 bg-primary/5 border-primary/20">
            Customers see an average of <span className="font-bold text-primary mx-1">12x ROI</span> in the first month
          </Badge>
        </div>
      </div>
    </div>
  );
}
