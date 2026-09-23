type StubPageProps = {
  title: string;
  description?: string;
};

export function StubPage({ title, description }: StubPageProps) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        ) : null}
      </div>
      <div className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">Placeholder — content arrives in a later wave.</p>
      </div>
    </div>
  );
}
