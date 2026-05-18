import { Check, Clock, User, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  apiConnected: boolean;
}

export function TikTokMethodStatus({ apiConnected }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          TikTok API Status
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
              <div className="font-medium">Official TikTok API</div>
              <div className="text-muted-foreground">
                {apiConnected
                  ? "Connected after OAuth via Login Kit"
                  : "Connect via OAuth to enable draft uploads"}
              </div>
            </div>
          </li>

          <li className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Environment</div>
              <div className="text-muted-foreground">
                Sandbox / Trial — Content Posting API approval requested for production
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
                Drafts to inbox only — you publish from the TikTok app, one video at a time
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
          Xponential uses TikTok&apos;s official Content Posting API to let
          brand owners send approved video drafts to their own TikTok inbox.
          The final decision to publish always happens inside the TikTok app.
        </p>
      </CardContent>
    </Card>
  );
}
