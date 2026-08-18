const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const delta = (now, prev) => Math.max(0, num(now) - num(prev));

const cumulativePrivateTax = (row = {}) => Object.keys(row)
  .filter((key) => key.startsWith("charge_privatePensionTax"))
  .reduce((sum, key) => sum + num(row[key]), 0);

export function derivePensionTakeHomeRows(yearly = []) {
  return yearly.map((row, index, rows) => {
    const prev = index > 0 ? rows[index - 1] : {};
    const publicGross = Math.max(0, num(row.publicPensionAnnual));
    const privateGross = Math.max(0, num(row.privatePensionAnnual));
    const publicTax = delta(row.charge_publicPensionTax, prev.charge_publicPensionTax);
    const privateTax = delta(cumulativePrivateTax(row), cumulativePrivateTax(prev));
    const seniorMedical = delta(row.charge_jpSeniorMedical75, prev.charge_jpSeniorMedical75);
    const publicNet = Math.max(0, publicGross - publicTax - seniorMedical);
    const privateNet = Math.max(0, privateGross - privateTax);
    const gross = publicGross + privateGross;
    const net = publicNet + privateNet;
    const periodAge = index > 0 ? Math.floor(num(prev.exactAge) + 1e-9) : Math.floor(num(row.exactAge) + 1e-9);
    return {
      ...row,
      pensionAge: periodAge,
      publicPensionGrossAnnual: publicGross,
      privatePensionGrossAnnual: privateGross,
      pensionGrossAnnual: gross,
      publicPensionTaxAnnual: publicTax,
      privatePensionTaxAnnual: privateTax,
      pensionMedicalAnnual: seniorMedical,
      publicPensionTakeHomeAnnual: publicNet,
      privatePensionTakeHomeAnnual: privateNet,
      pensionTakeHomeAnnual: net,
      publicPensionTakeHomeRate: publicGross > 0 ? publicNet / publicGross * 100 : null,
      privatePensionTakeHomeRate: privateGross > 0 ? privateNet / privateGross * 100 : null,
      pensionTakeHomeRate: gross > 0 ? net / gross * 100 : null,
    };
  });
}
