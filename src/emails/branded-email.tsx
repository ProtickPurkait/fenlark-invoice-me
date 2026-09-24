import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export interface EmailBrand {
  name: string;
  color: string;
  logoUrl: string | null;
  email: string;
  website: string;
}

export interface BrandedEmailProps {
  brand: EmailBrand;
  preview: string;
  /** Plain text; blank lines separate paragraphs. */
  message: string;
  summary?: { label: string; value: string; strong?: boolean }[];
  cta?: { label: string; url: string };
  secondaryCta?: { label: string; url: string };
  code?: string;
  footnote?: string;
}

const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

export function BrandedEmail({ brand, preview, message, summary, cta, secondaryCta, code, footnote }: BrandedEmailProps) {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: font, margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, maxWidth: 560, padding: "32px 32px 24px" }}>
          <Section style={{ marginBottom: 24 }}>
            {brand.logoUrl ? (
              <Img src={brand.logoUrl} alt={brand.name} height={40} style={{ maxHeight: 40, width: "auto" }} />
            ) : (
              <Text style={{ fontSize: 20, fontWeight: 700, color: brand.color, margin: 0 }}>{brand.name}</Text>
            )}
          </Section>

          {paragraphs.map((p, i) => (
            <Text key={i} style={{ fontSize: 15, lineHeight: "24px", color: "#27272a", margin: "0 0 14px", whiteSpace: "pre-line" }}>
              {p}
            </Text>
          ))}

          {code ? (
            <Section style={{ margin: "8px 0 20px" }}>
              <Text
                style={{
                  fontSize: 28,
                  letterSpacing: 8,
                  fontWeight: 700,
                  color: "#18181b",
                  backgroundColor: "#f4f4f5",
                  borderRadius: 6,
                  padding: "12px 0",
                  textAlign: "center",
                  margin: 0,
                }}
              >
                {code}
              </Text>
            </Section>
          ) : null}

          {summary && summary.length > 0 ? (
            <Section style={{ border: "1px solid #e4e4e7", borderRadius: 6, padding: "8px 16px", margin: "8px 0 20px" }}>
              {summary.map((row) => (
                <Row key={row.label}>
                  <Column style={{ fontSize: 14, color: "#71717a", padding: "6px 0" }}>{row.label}</Column>
                  <Column
                    style={{
                      fontSize: 14,
                      color: "#18181b",
                      padding: "6px 0",
                      textAlign: "right",
                      fontWeight: row.strong ? 700 : 400,
                    }}
                  >
                    {row.value}
                  </Column>
                </Row>
              ))}
            </Section>
          ) : null}

          {cta ? (
            <Section style={{ margin: "8px 0 16px" }}>
              <Button
                href={cta.url}
                style={{
                  backgroundColor: brand.color,
                  color: "#ffffff",
                  borderRadius: 6,
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "12px 20px",
                  textDecoration: "none",
                }}
              >
                {cta.label}
              </Button>
              {secondaryCta ? (
                <Link href={secondaryCta.url} style={{ fontSize: 14, color: brand.color, marginLeft: 16 }}>
                  {secondaryCta.label}
                </Link>
              ) : null}
            </Section>
          ) : null}

          {cta ? (
            <Text style={{ fontSize: 12, color: "#a1a1aa", margin: "0 0 8px", wordBreak: "break-all" }}>
              Or open this link: {cta.url}
            </Text>
          ) : null}

          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 12, color: "#a1a1aa", margin: 0, lineHeight: "18px" }}>
            {footnote ? `${footnote} ` : ""}
            {brand.name}
            {brand.email ? ` · ${brand.email}` : ""}
            {brand.website ? ` · ${brand.website}` : ""}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
