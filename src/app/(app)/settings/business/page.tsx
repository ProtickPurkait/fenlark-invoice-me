import type { Metadata } from "next";
import { BusinessForm } from "@/components/settings/business-form";
import { ImageUpload } from "@/components/settings/image-upload";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getSettings, logoUrl } from "@/lib/settings";

export const metadata: Metadata = { title: "Business profile" };

export default async function BusinessSettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  const canEdit = can(user.role, "settings:write");
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Logo & signature" description="PNG or JPEG, under 1 MB. A transparent PNG looks best." />
        <CardBody className="grid gap-6 md:grid-cols-2">
          <ImageUpload kind="logo" label="Logo" hint="Shown on invoices, emails and the client portal." previewUrl={logoUrl(s)} canEdit={canEdit} />
          <ImageUpload
            kind="signature"
            label="Signature"
            hint="Printed above “Authorised Signatory” on PDFs."
            previewUrl={s.signaturePath ? `/api/brand/signature?v=${s.updatedAt.getTime()}` : null}
            canEdit={canEdit}
          />
        </CardBody>
      </Card>
      <BusinessForm
        canEdit={canEdit}
        defaults={{
          legalName: s.legalName,
          tradeName: s.tradeName,
          addressLine1: s.addressLine1,
          addressLine2: s.addressLine2,
          city: s.city,
          postalCode: s.postalCode,
          stateCode: s.stateCode,
          country: s.country,
          email: s.email,
          phone: s.phone,
          website: s.website,
          gstRegistration: s.gstRegistration,
          gstin: s.gstin,
          pan: s.pan,
          udyamNumber: s.udyamNumber,
          lutArn: s.lutArn,
          lutValidFrom: s.lutValidFrom ?? "",
          lutValidTo: s.lutValidTo ?? "",
          signatoryName: s.signatoryName,
          brandColor: s.brandColor,
        }}
      />
    </div>
  );
}
