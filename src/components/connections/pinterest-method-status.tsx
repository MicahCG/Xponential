import { Check, Clock, User, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  apiConnected: boolean;
}

export function PinterestMethodStatus({ apiConnected }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pinterest API Status
        </h2>

        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {apiConnected ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Clock className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">Official Pinterest API</div>
              <div className="text-muted-foreground">
                {apiConnected
                  ? "Connected after OAuth"
                  : "Connect via OAuth to enable publishing"}
              </div>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Access Level</div>
              <div className="text-muted-foreground">
                Trial Access, pending Standard Access approval
              </div>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <User className="h-4 w-4 text-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Publishing Mode</div>
              <div className="text-muted-foreground">
                Human-controlled, one Pin at a time
              </div>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <FileText className="h-4 w-4 text-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Logging</div>
              <div className="text-muted-foreground">
                Every API request and response is recorded
              </div>
            </div>
          </li>
        </ul>

        <p className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          Xponential uses Pinterest&apos;s official API to let brand owners
          publish approved visual content to their own Pinterest accounts.
          Standard Access is requested so this workflow can be used in
          production.
        </p>
      </CardContent>
    </Card>
  );
}
