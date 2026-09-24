CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_label" text DEFAULT '' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"trade_name" text DEFAULT '' NOT NULL,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"gst_registration" text DEFAULT 'regular' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"pan" text DEFAULT '' NOT NULL,
	"udyam_number" text DEFAULT '' NOT NULL,
	"lut_arn" text DEFAULT '' NOT NULL,
	"lut_valid_from" date,
	"lut_valid_to" date,
	"logo_path" text,
	"signature_path" text,
	"signatory_name" text DEFAULT '' NOT NULL,
	"brand_color" text DEFAULT '#0f766e' NOT NULL,
	"bank_account_name" text DEFAULT '' NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"bank_account_number" text DEFAULT '' NOT NULL,
	"bank_ifsc" text DEFAULT '' NOT NULL,
	"bank_branch" text DEFAULT '' NOT NULL,
	"bank_swift" text DEFAULT '' NOT NULL,
	"upi_id" text DEFAULT '' NOT NULL,
	"upi_payee_name" text DEFAULT '' NOT NULL,
	"default_currency" text DEFAULT 'INR' NOT NULL,
	"payment_terms_days" integer DEFAULT 15 NOT NULL,
	"quote_validity_days" integer DEFAULT 30 NOT NULL,
	"round_off" boolean DEFAULT true NOT NULL,
	"invoice_notes" text DEFAULT 'Thank you for your business.' NOT NULL,
	"invoice_terms" text DEFAULT '' NOT NULL,
	"quote_terms" text DEFAULT '' NOT NULL,
	"reminders_enabled" boolean DEFAULT false NOT NULL,
	"reminder_offsets" integer[] DEFAULT '{-3,0,7,14}'::integer[] NOT NULL,
	"send_payment_receipts" boolean DEFAULT true NOT NULL,
	"bcc_email" text DEFAULT '' NOT NULL,
	"gateway_for_inr" text DEFAULT '' NOT NULL,
	"gateway_for_foreign" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_settings_singleton" CHECK ("business_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'business' NOT NULL,
	"name" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"cc_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"pan" text DEFAULT '' NOT NULL,
	"is_sez" boolean DEFAULT false NOT NULL,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"shipping_address" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"payment_terms_days" integer,
	"tds_applicable" boolean DEFAULT false NOT NULL,
	"tds_rate" numeric(5, 2),
	"tds_section" text DEFAULT '' NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"portal_enabled" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hsn_sac" text DEFAULT '' NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text DEFAULT 'OTH' NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"discount_type" text DEFAULT 'percent' NOT NULL,
	"discount_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"gross" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) NOT NULL,
	"taxable" numeric(14, 2) NOT NULL,
	"cgst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"number" text,
	"fy" text,
	"issue_date" date NOT NULL,
	"due_date" date,
	"valid_until" date,
	"client_id" uuid NOT NULL,
	"client_snapshot" jsonb,
	"seller_snapshot" jsonb,
	"currency" text DEFAULT 'INR' NOT NULL,
	"exchange_rate" numeric(14, 6) DEFAULT '1' NOT NULL,
	"place_of_supply" text,
	"supply_type" text DEFAULT 'intra' NOT NULL,
	"export_tax" text,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tds_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credited_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"debited_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"balance_due" numeric(14, 2) DEFAULT '0' NOT NULL,
	"related_document_id" uuid,
	"note_reason" text,
	"recurring_profile_id" uuid,
	"public_token" text,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"document_id" uuid,
	"to" text[] NOT NULL,
	"cc" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_configs" (
	"provider" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"public_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_config" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'service' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hsn_sac" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'OTH' NOT NULL,
	"rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_counters" (
	"doc_type" text NOT NULL,
	"period" text NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "number_counters_doc_type_period_pk" PRIMARY KEY("doc_type","period")
);
--> statement-breakpoint
CREATE TABLE "number_series" (
	"doc_type" text PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"pattern" text DEFAULT '{PREFIX}/{FY}/{SEQ}' NOT NULL,
	"padding" integer DEFAULT 4 NOT NULL,
	"reset_yearly" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text DEFAULT 'payment' NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tds_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tds_section" text DEFAULT '' NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"gateway" text,
	"gateway_payment_id" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"frequency" text NOT NULL,
	"start_date" date NOT NULL,
	"next_run_date" date,
	"end_date" date,
	"max_occurrences" integer,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"auto_issue" boolean DEFAULT true NOT NULL,
	"auto_send" boolean DEFAULT false NOT NULL,
	"payment_terms_days" integer DEFAULT 15 NOT NULL,
	"template" jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders_sent" (
	"document_id" uuid NOT NULL,
	"offset_days" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_sent_document_id_offset_days_pk" PRIMARY KEY("document_id","offset_days")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_recurring_profile_id_recurring_profiles_id_fk" FOREIGN KEY ("recurring_profile_id") REFERENCES "public"."recurring_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_configs" ADD CONSTRAINT "gateway_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_links" ADD CONSTRAINT "gateway_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_profiles" ADD CONSTRAINT "recurring_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_profiles" ADD CONSTRAINT "recurring_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX "clients_email_idx" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "document_lines_document_idx" ON "document_lines" USING btree ("document_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_type_number_key" ON "documents" USING btree ("type","number");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_public_token_key" ON "documents" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "documents_type_status_idx" ON "documents" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "documents_client_idx" ON "documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "documents_issue_date_idx" ON "documents" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "documents_related_idx" ON "documents" USING btree ("related_document_id");--> statement-breakpoint
CREATE INDEX "email_log_document_idx" ON "email_log" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "email_log_created_idx" ON "email_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_links_external_key" ON "gateway_links" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "gateway_links_document_idx" ON "gateway_links" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_token_hash_key" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "payments_document_idx" ON "payments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "payments" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_payment_key" ON "payments" USING btree ("gateway","gateway_payment_id");--> statement-breakpoint
CREATE INDEX "recurring_next_run_idx" ON "recurring_profiles" USING btree ("status","next_run_date");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_key" ON "webhook_events" USING btree ("provider","event_id");