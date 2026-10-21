import { UiText, useTranslation } from '@ui/i18n/Locale';
import { AiCredits } from '@ui/pages/billing/AiCredits';

export function AiCreditsSection() {
  const { t } = useTranslation();
  return <section aria-label={t("AI editing credits")} className="rounded-lg border border-edge-medium bg-surface-1 p-5 space-y-3 text-fg-primary">
    <h2 className="text-xl font-semibold"><UiText text="AI editing credits" /></h2>
    <p className="text-sm text-fg-secondary"><UiText text="Upload your video, describe the edit, then preview your AI edit before applying it." /></p>
    <p className="text-sm text-fg-secondary"><UiText text="Credits are purchased separately from your subscription. Buying credits does not renew your subscription." /></p>
    <AiCredits />
    <p className="text-sm text-fg-secondary"><UiText text="Based on your original video length: a 23-second video costs 5 credits in Standard or 10 in High. High improves AI editing quality; export resolution is chosen separately." /></p>
    <p className="text-sm text-fg-secondary"><UiText text="Your credit cost is shown before you create an AI edit. The pack price is confirmed before payment." /></p>
  </section>;
}
