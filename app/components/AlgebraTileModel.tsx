import { type AlgebraTileModel as AlgebraTileModelData, type AlgebraTileRow } from "@/lib/fillBlank";

type TileKind = "unit" | "x" | "x2";
type TileSign = "positive" | "negative";

function AlgebraTile({ kind, sign }: { kind: TileKind; sign: TileSign }) {
  const dimensions = kind === "unit" ? "h-4 w-4" : kind === "x" ? "h-12 w-4" : "h-12 w-12";
  return <span role="img" aria-label={`${sign} ${kind === "x2" ? "x squared" : kind} tile`} style={{ backgroundColor: sign === "positive" ? "#020617" : "#ffffff" }} className={`${dimensions} inline-block shrink-0 border-2 border-slate-950`} />;
}

const tileGroups: Array<{ count: keyof AlgebraTileRow; kind: TileKind; sign: TileSign }> = [
  { count: "positiveX2", kind: "x2", sign: "positive" },
  { count: "negativeX2", kind: "x2", sign: "negative" },
  { count: "positiveX", kind: "x", sign: "positive" },
  { count: "negativeX", kind: "x", sign: "negative" },
  { count: "positiveUnit", kind: "unit", sign: "positive" },
  { count: "negativeUnit", kind: "unit", sign: "negative" },
];

export default function AlgebraTileModel({ model }: { model: AlgebraTileModelData }) {
  return <div className="mb-6 rounded-xl border border-slate-300 bg-white p-4 text-slate-950">
    {model.showLegend && <div className="mx-auto mb-6 w-fit rounded border-2 border-slate-700 p-3">
      <p className="mb-3 font-serif font-bold">Legend</p>
      <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
        {tileGroups.map(({ kind, sign }) => <div key={`${sign}-${kind}`} className="flex items-center gap-2"><AlgebraTile kind={kind} sign={sign} /><span>= {sign === "negative" ? "−" : ""}{kind === "unit" ? "1" : kind === "x" ? "x" : "x²"}</span></div>)}
      </div>
    </div>}
    <div className="space-y-4">
      {model.rows.map((row) => <div key={row.id} className="flex min-h-14 items-center gap-4"><strong className="w-32 shrink-0 text-right font-serif">{row.label}:</strong><div className="flex flex-wrap items-center gap-2">{tileGroups.flatMap(({ count, kind, sign }) => Array.from({ length: row[count] as number }, (_, index) => <AlgebraTile key={`${count}-${index}`} kind={kind} sign={sign} />))}</div></div>)}
    </div>
  </div>;
}
