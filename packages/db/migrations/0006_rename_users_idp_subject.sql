-- Clerk → FerrisKey (OIDC): the stored id is now the identity provider's `sub` claim.
ALTER TABLE "users" RENAME COLUMN "clerk_user_id" TO "idp_subject";
--> statement-breakpoint
ALTER INDEX "users_clerk_user_id_idx" RENAME TO "users_idp_subject_idx";
