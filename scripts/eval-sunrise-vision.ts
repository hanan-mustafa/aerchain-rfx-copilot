/**
 * Measures vision-model accuracy on the Sunrise rate-card photo (the one
 * source with no text layer), so the choice of MODEL.vision is evidence-based.
 * Runs the real image extractor (both passes + reconciliation) N times per
 * model and scores every line against the answer key. Makes real API calls.
 *
 *   npx tsx scripts/eval-sunrise-vision.ts claude-sonnet-4-5,claude-sonnet-5-5 3
 */
import fs from "fs";
// Load ANTHROPIC_API_KEY from .env.local like `next dev` does.
if (fs.existsSync(".env.local")) {
  for (const l of fs.readFileSync(".env.local", "utf-8").split("\n")) {
    const m = l.match(/^(\w+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
import { MODEL } from "../lib/claude";
import { SAMPLE_RFX } from "../lib/rfxData";
// Sunrise ground truth in USD; "box" = quoted per box of 10 (line 24). Lines
// 25, 27, 28 and 30 are not quoted on the card.
const EXPECT: Record<number,[number,string]> = {1:[506.02,"u"],2:[698.80,"u"],3:[891.57,"u"],4:[1421.69,"u"],5:[118.07,"u"],6:[198.80,"u"],7:[38.55,"u"],8:[65.06,"u"],9:[17.47,"u"],10:[7.83,"u"],11:[4.22,"u"],12:[26.51,"u"],13:[81.93,"u"],14:[40.96,"u"],15:[21.69,"u"],16:[265.06,"u"],17:[783.13,"u"],18:[4638.55,"u"],19:[10.24,"u"],20:[25.30,"u"],21:[86.75,"u"],22:[11.45,"u"],23:[19.28,"u"],24:[66.27,"box"],26:[114.46,"u"],29:[55.42,"u"]};
async function main(){
  const models = process.argv[2].split(",");
  const runs = parseInt(process.argv[3] ?? "2");
  const { extractFromImage } = await import("../lib/extractors/image");
  const buf = fs.readFileSync("data/vendor-uploads/Vendor_E_Sunrise_Computech_RateCard.jpg");
  for (const m of models) {
    (MODEL as any).vision = m;
    const jobs = Array.from({length: runs}, async (_, r) => {
      const t=Date.now();
      try {
        const { lines } = await extractFromImage(buf, "image/jpeg", "sunrise", SAMPLE_RFX);
        const errs: string[] = [];
        const byRef = new Map(lines.map(l=>[l.line_ref,l]));
        for (const [ref,[p,u]] of Object.entries(EXPECT)) { const l=byRef.get(+ref); if(!l){errs.push(`${ref}:missing`);continue;}
          const box=/box/i.test(l.unit_of_measure); if(l.unit_price!==p || box!==(u==="box")) errs.push(`${ref}:${l.unit_price}/${l.unit_of_measure}${l.flags.includes("LOW_CONFIDENCE")?"(LC)":""}`); }
        for (const l of lines) if (l.line_ref!==null && !(l.line_ref in EXPECT) && !l.flags.includes("NOT_QUOTED")) errs.push(`extra ${l.line_ref}:${l.unit_price}${l.flags.includes("LOW_CONFIDENCE")?"(LC)":""}`);
        const flagged = lines.filter(l=>l.flags.includes("LOW_CONFIDENCE")).map(l=>l.line_ref);
        return `${m} run${r+1} ${((Date.now()-t)/1000).toFixed(0)}s: ${errs.length} wrong ${errs.join(" ")} | LOW_CONF on ${flagged.join(",")}`;
      } catch(e:any){ return `${m} run${r+1} ERROR ${e.message.slice(0,300)}`; }
    });
    for (const s of await Promise.all(jobs)) console.log(s);
  }
}
main();
