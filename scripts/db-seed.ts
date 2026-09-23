/**
 * Seed stub — Wave 1 fills bootstrap admin + sample vulns.
 * Safe to run multiple times (idempotent upserts in later waves).
 */
import "dotenv/config";

async function main() {
  console.log(
    "db:seed stub (Wave 0). Bootstrap admin + fixtures arrive in Wave 1+.",
  );
  console.log("BOOTSTRAP_ADMIN_EMAIL=", process.env.BOOTSTRAP_ADMIN_EMAIL ?? "(unset)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
