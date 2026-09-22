import { bootstrapAdmin } from "@/lib/auth/bootstrap";

async function main() {
  const result = await bootstrapAdmin();

  if (result.status === "created") {
    console.log(`Bootstrap admin created: ${result.email}`);
    process.exit(0);
  }

  if (result.status === "exists") {
    console.log(`Bootstrap admin already exists: ${result.email}`);
    process.exit(0);
  }

  console.error(`Bootstrap skipped: ${result.reason}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
