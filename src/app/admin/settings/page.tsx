import type { Metadata } from "next";
import { Suspense } from "react";
import { Info } from "lucide-react";
import { SettingForm } from "@/app/admin/settings/setting-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listSettings } from "@/server/services/settings";
import {
  SETTING_GROUPS,
  SETTINGS,
  settingInputValue,
  type SettingGroup,
} from "@/server/services/settings/registry";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Prices, free plan limits and payouts. Changes apply immediately and are recorded in the audit log."
      />
      <Suspense fallback={<PageSkeleton />}>
        <SettingsGroups />
      </Suspense>
    </div>
  );
}

async function SettingsGroups() {
  const user = await requirePermission("settings.view");
  const canEdit = can(user.roles, "settings.manage");
  const settings = await listSettings();

  return (
    <div className="space-y-6">
      {!canEdit ? (
        <Alert>
          <Info />
          <AlertDescription>Only super admins can change settings.</AlertDescription>
        </Alert>
      ) : null}

      {(Object.keys(SETTING_GROUPS) as SettingGroup[]).map((group) => {
        const items = settings.filter((setting) => SETTINGS[setting.key].group === group);
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{SETTING_GROUPS[group]}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y pt-0">
              {items.map((setting) => {
                const definition = SETTINGS[setting.key];
                return (
                  <SettingForm
                    key={setting.key}
                    settingKey={setting.key}
                    label={definition.label}
                    description={definition.description}
                    kind={definition.kind}
                    inputValue={settingInputValue(setting.key, setting.value)}
                    canEdit={canEdit}
                  />
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
