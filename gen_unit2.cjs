const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign
} = require('C:/AfriserveBackend/docx_tmp/node_modules/docx');
const fs = require('fs');

const TNR = "Times New Roman";
const sz = 24;

const border = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
const borders = { top: border, bottom: border, left: border, right: border };

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    indent: opts.noIndent ? undefined : { firstLine: opts.firstLine !== undefined ? opts.firstLine : 720 },
    spacing: { line: 480, lineRule: "auto" },
    children: [new TextRun({ text, font: TNR, size: sz, bold: !!opts.bold, italics: !!opts.italic })]
  });
}

function pMixed(runs, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    indent: opts.noIndent ? undefined : { firstLine: opts.firstLine !== undefined ? opts.firstLine : 720 },
    spacing: { line: 480, lineRule: "auto" },
    children: runs.map(r => new TextRun({ text: r.text, font: TNR, size: sz, bold: !!r.bold, italics: !!r.italic }))
  });
}

function heading(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { firstLine: 0 },
    spacing: { line: 480, lineRule: "auto" },
    children: [new TextRun({ text, font: TNR, size: sz, bold: true })]
  });
}

function blank() {
  return new Paragraph({ spacing: { line: 480, lineRule: "auto" }, children: [new TextRun({ text: "", font: TNR, size: sz })] });
}

function cell(text, isHeader, w) {
  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: isHeader ? { fill: "CCCCCC", type: ShadingType.CLEAR } : { fill: "FFFFFF", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, lineRule: "auto" },
      children: [new TextRun({ text, font: TNR, size: sz, bold: isHeader })]
    })]
  });
}

function makeTable(data) {
  const colW = [2340, 4680];
  return new Table({
    width: { size: 7020, type: WidthType.DXA },
    columnWidths: colW,
    rows: data.map((row, i) =>
      new TableRow({ children: row.map((text, j) => cell(text, i === 0, colW[j])) })
    )
  });
}

function tableCaption(label, title) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, indent: { firstLine: 0 },
      spacing: { line: 480, lineRule: "auto" },
      children: [new TextRun({ text: label, font: TNR, size: sz, bold: true, italics: true })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, indent: { firstLine: 0 },
      spacing: { line: 480, lineRule: "auto" },
      children: [new TextRun({ text: title, font: TNR, size: sz, italics: true })]
    })
  ];
}

function tableNote(text) {
  return new Paragraph({
    indent: { firstLine: 0 },
    spacing: { line: 480, lineRule: "auto" },
    children: [
      new TextRun({ text: "Note. ", font: TNR, size: sz, italics: true }),
      new TextRun({ text, font: TNR, size: sz })
    ]
  });
}

function ref(runs) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { left: 720, hanging: 720 },
    spacing: { line: 480, lineRule: "auto" },
    children: runs.map(r => new TextRun({ text: r.text, font: TNR, size: sz, italics: !!r.italic }))
  });
}

const unempData = [
  ["Year", "Unemployment Rate (%)"],
  ["2014", "11.5"], ["2015", "11.4"], ["2016", "11.2"], ["2017", "11.0"],
  ["2018", "10.9"], ["2019", "10.8"], ["2020", "13.1"], ["2021", "12.7"],
  ["2022", "12.6"], ["2023", "12.7"], ["2024", "12.7 (est.)"],
];

const inflData = [
  ["Year", "Inflation Rate (%)"],
  ["2014", "6.9"], ["2015", "6.6"], ["2016", "6.3"], ["2017", "8.0"],
  ["2018", "4.7"], ["2019", "5.2"], ["2020", "5.4"], ["2021", "6.1"],
  ["2022", "7.7"], ["2023", "6.8"], ["2024", "5.9 (est.)"],
];

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      // TITLE PAGE
      blank(), blank(),
      p("Assignment: Analysis of Unemployment and Inflation Trends in Kenya (2014\u20132024)", { align: AlignmentType.CENTER, bold: true, noIndent: true }),
      blank(),
      p("Course Title: Macroeconomics", { align: AlignmentType.CENTER, noIndent: true }),
      p("Instructor Name: Shabbir Ahmed", { align: AlignmentType.CENTER, noIndent: true }),
      p("Date: 04/20/2026", { align: AlignmentType.CENTER, noIndent: true }),
      blank(), blank(), blank(),

      // INTRO
      p("Over the past ten years, Kenya\u2019s economy has gone through quite a few changes, particularly in unemployment and inflation. These two indicators matter a lot because they affect people\u2019s daily lives and reveal how the broader economy is performing. This report looks at how unemployment is measured in Kenya, tracks trends from 2014 to 2024, classifies the types of unemployment the country faces, and examines how inflation has affected the cost of living. It also discusses what these patterns mean for a developing country like Kenya and whether the picture would look different if Kenya were a developed nation."),

      blank(),
      heading("1. Unemployment: Measurement and Current Status"),
      p("As of early 2024, Kenya\u2019s unemployment rate is estimated at around 12.7%. That figure, however, does not fully capture the real situation on the ground. A large segment of the working population holds informal jobs with low and unstable pay\u2014technically employed, but still financially strained."),
      p("The Kenya National Bureau of Statistics (KNBS) measures unemployment through the Labour Force Survey, using standards set by the International Labour Organization (ILO). People aged 16 and above are grouped into three categories: employed, unemployed, and outside the labour force. While this method is internationally accepted, it underestimates underemployment, which is widespread in Kenya\u2019s informal sector."),

      blank(),
      heading("2. Unemployment Trends (2014\u20132024)"),
      ...tableCaption("Table 1", "Kenya Annual Unemployment Rate, 2014\u20132024"),
      blank(),
      makeTable(unempData),
      blank(),
      tableNote("Data sourced from KNBS Labour Force Reports and World Bank (2024) estimates. 2024 figure is a projection."),

      blank(),
      p("Between 2014 and 2019, Kenya\u2019s unemployment rate was relatively stable, gradually falling from 11.5% to 10.8%. Growth in construction, telecommunications, and tech-based services helped create jobs, especially for young people in urban centres. Nairobi\u2019s digital ecosystem in particular attracted investment that opened new entry points into the labour market."),
      p("The COVID-19 pandemic reversed this progress sharply. Unemployment jumped to 13.1% in 2020 as businesses shut down or scaled back to survive reduced demand (Gourinchas, 2023). Recovery since 2021 has been slow\u2014high inflation and increased taxation have made expansion expensive, so job creation has not kept up with the growing labour force. Structurally, Kenya\u2019s dependence on rain-fed agriculture means that droughts translate directly into job losses, and a fast-growing youth population continues to outpace available opportunities."),

      blank(),
      heading("3. Classification of Unemployment"),
      p("In the short run, Kenya is experiencing cyclical unemployment\u2014job losses tied to the slowdown in economic activity. During the pandemic, falling consumer demand led to widespread layoffs across hospitality, transport, and retail (Gourinchas, 2023). This type typically eases as the economy recovers and demand picks up again."),
      p("In the long run, structural unemployment is the bigger challenge. Many graduates lack the practical and technical skills that growing sectors like manufacturing and ICT actually need. This mismatch between worker qualifications and employer needs persists regardless of the economic cycle."),
      p("The policy responses differ as well. Cyclical unemployment calls for demand-side measures such as fiscal stimulus or interest rate cuts. Structural unemployment, by contrast, requires long-term investments in vocational training, curriculum reform, and regional infrastructure\u2014solutions that take years to show results."),

      blank(),
      heading("4. Inflation Rate and the Cost of Living"),
      ...tableCaption("Table 2", "Kenya Annual Inflation Rate, 2014\u20132024"),
      blank(),
      makeTable(inflData),
      blank(),
      tableNote("Data sourced from KNBS CPI Reports and IMF (2023) country data. 2024 figure is a projection."),

      blank(),
      p("Kenya measures inflation using the Consumer Price Index (CPI), which tracks price changes across a basket of goods and services over time. Food carries a weighting of roughly one-third in the basket, so food price spikes feed directly into headline inflation\u2014a pattern that hits low-income households especially hard."),
      p("Economists also use core inflation (which excludes volatile food and fuel prices) to isolate underlying price trends, and the Producer Price Index (PPI), which tracks cost changes at the production stage before goods reach consumers (International Monetary Fund [IMF], 2023). Together, these measures give a more complete picture of price dynamics."),
      p("As Table 2 shows, inflation spiked to 8.0% in 2017 and again to 7.7% in 2022, driven mainly by food insecurity and global fuel price shocks. These episodes eroded household purchasing power and strained budgets across all income groups, but particularly among informal workers who lack wage indexation."),

      blank(),
      heading("5. Economic Implications for Kenya"),
      p("High unemployment and persistent inflation create a difficult cycle for a developing economy. Workers in Kenya\u2019s large informal sector do not benefit from automatic cost-of-living adjustments, so rising prices immediately reduce their real income (Shapiro et al., 2023). This translates into lower living standards and greater vulnerability to poverty."),
      p("Unstable inflation also discourages investment. When businesses cannot predict future costs reliably, they hold back on expansion and hiring, which further slows job creation (Ha et al., 2019). The IMF has noted that developing economies with high inflation frequently see weaker flows of foreign direct investment as a consequence."),
      p("The situation would look quite different if Kenya were a developed country. Advanced economies typically have stronger central banks with well-established credibility and more policy tools to keep inflation anchored. They also maintain robust social safety nets\u2014unemployment insurance, food assistance, healthcare subsidies\u2014that protect workers during downturns. In Kenya, these systems are limited, so households bear the full impact of economic shocks on their own. Beyond that, developed economies have more diversified labour markets and stronger institutional frameworks, making it easier to address structural unemployment through targeted policy."),

      blank(),
      heading("Conclusion"),
      p("Unemployment and inflation remain two of Kenya\u2019s most persistent economic challenges. Official figures give a useful starting point, but the reality\u2014widespread underemployment, informal work, and limited safety nets\u2014is tougher than the numbers suggest. The past decade brought both growth and setbacks, with the COVID-19 pandemic and global price shocks causing significant disruptions. Addressing these issues requires more than short-term interventions. Sustainable progress will depend on long-term investment in education and skills, stronger job creation strategies, and more resilient macroeconomic institutions."),

      blank(),
      heading("References"),
      ref([
        { text: "Gourinchas, P.-O. (2023). " },
        { text: "Global economy on track but not yet out of the woods.", italic: true },
        { text: " IMF Blog. https://www.imf.org/en/Blogs/Articles/2023/01/31/global-economy-on-track-but-not-yet-out-of-the-woods" }
      ]),
      ref([
        { text: "Ha, J., Kose, M. A., & Ohnsorge, F. L. (2019). " },
        { text: "Inflation in emerging and developing economies.", italic: true },
        { text: " World Bank Group. https://doi.org/10.1596/978-1-4648-1375-7" }
      ]),
      ref([
        { text: "International Monetary Fund. (2023). " },
        { text: "Annual report 2023: A resilient world.", italic: true },
        { text: " IMF. https://www.imf.org/en/Publications/Annual-Report/Issues/2023/09/29/2023-imf-annual-report" }
      ]),
      ref([
        { text: "Kenya National Bureau of Statistics. (2023). " },
        { text: "Labour force report, 2023.", italic: true },
        { text: " KNBS. https://www.knbs.or.ke/labour-force-reports/" }
      ]),
      ref([
        { text: "Shapiro, D., MacDonald, D., & Greenlaw, S. (2023). " },
        { text: "Principles of macroeconomics ", italic: true },
        { text: "(3rd ed.). OpenStax. https://openstax.org/books/principles-macroeconomics-3e/pages/1-introduction" }
      ]),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("C:/AfriserveBackend/BUS 1104-01 - AY2026-T4Assignment Activity Unit 2 REVISED.docx", buf);
  console.log("DONE");
}).catch(e => { console.error(e); process.exit(1); });
