// English line with its Uzbek translation underneath.
export default function Bilingual({ en, uz }: { en: string; uz: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[15px] leading-relaxed text-slate-900">{en}</p>
      {uz && (
        <p className="flex gap-2 text-[14px] leading-relaxed text-slate-500">
          <span className="mt-0.5 shrink-0 self-start rounded bg-slate-100 px-1 text-[10px] font-bold leading-4 text-slate-500">
            UZ
          </span>
          <span>{uz}</span>
        </p>
      )}
    </div>
  );
}
