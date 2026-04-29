const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  NumberFormat, Header, PageNumber,
} = require('docx');
const fs = require('fs');

const TNR = "Times New Roman";
const SZ  = 24; // 12 pt

const DS = { line: 480, lineRule: 'auto', before: 0, after: 0 };

function body(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: TNR, size: SZ })],
    spacing: DS,
    indent: { firstLine: 720 },
  });
}

function blank() {
  return new Paragraph({
    children: [new TextRun({ text: "", font: TNR, size: SZ })],
    spacing: DS,
  });
}

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: TNR, size: SZ, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: DS,
  });
}

function ref(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: TNR, size: SZ })],
    spacing: DS,
    indent: { left: 720, hanging: 720 },
  });
}

function center(text, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, font: TNR, size: SZ, bold })],
    alignment: AlignmentType.CENTER,
    spacing: DS,
  });
}

const doc = new Document({
  styles: { default: { document: { run: { font: TNR, size: SZ } } } },
  sections: [{
    properties: {
      page: {
        size:   { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({ children: [PageNumber.CURRENT], font: TNR, size: SZ })],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 0 },
        })],
      }),
    },
    children: [
      // TITLE PAGE
      blank(), blank(), blank(), blank(),
      center("Competition and Fair Markets: An Analysis of the Kenyan Regulatory Landscape", true),
      blank(),
      center("University of the People"),
      blank(),
      center("ECON 1580-01: Applied Economics Theory and Practice"),
      blank(),
      center("Instructor: Alfredo Gonzalez"),
      blank(),
      center("April 20, 2026"),

      // Body starts on new page
      new Paragraph({
        pageBreakBefore: true,
        children: [new TextRun({ text: "", font: TNR, size: SZ })],
        spacing: DS,
      }),
      center("Competition and Fair Markets: An Analysis of the Kenyan Regulatory Landscape", true),
      blank(),

      // INTRODUCTION
      body("Competition is the lifeblood of a healthy market economy. Competitive environments drive innovation, ensure productive efficiency, and protect consumer welfare by keeping prices aligned with marginal costs (Greenlaw et al., 2022). The European Union\u2019s prosecution of Google demonstrated that without robust antitrust enforcement, dominant players can undermine consumer choice and stifle innovation across entire sectors of the economy. Developing economies, however, face a dual challenge: stimulating market growth while simultaneously preventing the concentration of power that can derail it. This paper examines Kenya\u2019s regulatory framework, focusing on the Competition Act of 2010 and the Competition Authority of Kenya (CAK), as well as the landmark Safaricom M-Pesa agent exclusivity investigation, to evaluate how effectively the country\u2019s competition laws maintain fair, dynamic markets for both businesses and consumers."),
      blank(),

      // SECTION 1
      h1("The Competition Act of 2010"),
      blank(),
      body("The cornerstone of Kenya\u2019s market regulation is the Competition Act (No. 12 of 2010). Enacted to replace the outdated Restrictive Trade Practices, Monopolies and Price Control Act of 1988, this landmark law was designed to foster economic efficiency and protect the public from the pitfalls of market concentration. Its framework rests on three core pillars: fairness, consumer protection, and economic efficiency."),
      blank(),
      body("To promote fairness, the Act explicitly prohibits restrictive trade practices. Under Section 21, activities such as price-fixing, collusive tendering, and market-sharing among competitors are illegal and carry significant financial penalties. In a market where dominant players in sectors such as manufacturing or agriculture could easily collude to form informal cartels, this provision is critical. As Greenlaw et al. (2022) explain, without such rules, firms in concentrated markets have a strong incentive to act collectively like a monopoly, maximizing joint profits at the direct expense of the consumer."),
      blank(),
      body("For consumer protection, the Act empowers the CAK to investigate unconscionable conduct, including misleading advertising and the undisclosed bundling of fees. Businesses are legally required to communicate the true cost of goods and services. Finally, the Act ensures economic efficiency through a compulsory Mergers and Acquisitions review process. Before any large merger is finalized, the CAK must determine whether it creates or strengthens a dominant position. This gatekeeping function prevents the formation of unjustified monopolies, ensuring markets remain open to innovative new entrants\u2014consistent with the \u201CInnovation Competition\u201D framework outlined by Spulber (2022), which emphasizes protecting the process of competition itself, not merely its current participants."),
      blank(),

      // SECTION 2
      h1("The Safaricom M-Pesa Agent Exclusivity Investigation"),
      blank(),
      body("A defining antitrust case in Kenya\u2019s regulatory history is the CAK\u2019s 2014 investigation into Safaricom Limited\u2019s use of exclusive dealing contracts within its M-Pesa mobile money agent network. At the time, Safaricom held a dominant market share exceeding 65% of Kenyan mobile telecommunications subscribers and had cultivated a nationwide network of over 80,000 physical agents. Critically, their contracts contained exclusivity clauses that legally barred agents from registering customers or processing transactions for rival services, such as Airtel Money or Orange Money."),
      blank(),
      body("This practice constituted an abuse of a dominant market position under Section 24 of the Competition Act. Because the scale and geographic reach of Safaricom\u2019s existing agent infrastructure was practically impossible to replicate from scratch, rival operators faced near-insurmountable barriers to entry (Greenlaw et al., 2022). Small shop owners who wished to serve multiple networks were unable to do so under threat of contract termination, effectively locking competitors out of the most cost-effective distribution channel available in the Kenyan market."),
      blank(),
      body("After its investigation, the CAK issued a ruling requiring Safaricom to remove the exclusivity clauses, mandating that all agents be free to simultaneously provide services from any competing network. This intervention directly lowered barriers to entry, allowing rivals to access an established distribution infrastructure without bearing the prohibitive cost of building a parallel one. The case reflects Tirole\u2019s (2024) principle of interoperability as a competitive remedy, demonstrating that when dominant firms are required to share key infrastructure on fair terms, the network effects that typically entrench a monopoly can be systematically dismantled to enable genuine market competition."),
      blank(),

      // SECTION 3
      h1("Effectiveness and Areas for Improvement"),
      blank(),
      body("Kenya\u2019s competition framework has achieved several concrete outcomes. The CAK\u2019s dedicated Buyer Power unit has actively protected small suppliers from exploitative payment delays imposed by large supermarket chains, shielding SMEs from market foreclosure. In its merger review function, the CAK conditionally approved the 2016 Airtel-Telkom Kenya merger, attaching spectrum-sharing conditions specifically designed to preserve competitive balance in the telecommunications market. These interventions demonstrate an active and capable regulatory institution."),
      blank(),
      body("However, significant weaknesses persist. First, the Competition Tribunal\u2019s appeals process can be protracted; legal delays allow anti-competitive conduct to continue during litigation, undermining the deterrent effect of regulatory enforcement. Second, the digital economy presents a substantial structural challenge. As Eshbayev et al. (2022) and Munir et al. (2024) argue, global technology platforms that control data as a competitive asset and operate across national borders pose regulatory difficulties that the 2010 Act\u2014written before the smartphone era\u2014is ill-equipped to address. The CAK currently lacks specific tools to govern algorithmic pricing, digital gatekeeper power, or data-driven market exclusion. Enacting modernized legislation that incorporates data sovereignty principles and imposes clear obligations on digital gatekeepers is urgently required to ensure Kenya\u2019s framework remains credible and effective."),
      blank(),

      // CONCLUSION
      h1("Conclusion"),
      blank(),
      body("Kenya\u2019s evolution from a price-controlled economy toward a dynamically regulated market underscores the indispensable role of competition policy. The Competition Act of 2010 has provided a strong institutional foundation, evidenced by landmark interventions such as the Safaricom M-Pesa case and the CAK\u2019s ongoing protection of SMEs from buyer-power abuse. However, the accelerating growth of the digital economy demands that this foundation be reinforced. By streamlining the Tribunal appeals process and enacting digital-specific competition legislation, Kenya can ensure that the promise of fair markets is realized not only for today\u2019s consumers and businesses, but also for the innovators and entrepreneurs who will define its economic future."),
      blank(),

      // REFERENCES
      h1("References"),
      blank(),
      ref("Centre for International Governance Innovation. (2022, May 25). Competition policy explained [Video]. YouTube."),
      blank(),
      ref("Competition Act No. 12 of 2010, Laws of Kenya."),
      blank(),
      ref("Competition Authority of Kenya. (2014). Annual report and financial statements. https://www.cak.go.ke"),
      blank(),
      ref("Eshbayev, O., Rakhimova, S., Mirzaliev, S., Mulladjanova, N., Alimxodjaeva, N., Akhmedova, D., & Akbarova, B. (2022). A systematic mapping study of effective regulations and policies against digital monopolies. ACM Digital Library. https://doi.org/10.1145/3553206.3553218"),
      blank(),
      ref("Greenlaw, S., Shapiro, D., & MacDonald, D. (2022). Principles of economics (3rd ed.). OpenStax."),
      blank(),
      ref("Munir, S., Kollnig, K., Shuba, A., & Shafiq, Z. (2024, April 4). Google\u2019s Chrome antitrust paradox. arXiv. https://arxiv.org/abs/2404.03457"),
      blank(),
      ref("Spulber, D. F. (2022). Antitrust and innovation competition. Journal of Antitrust Enforcement, 11(1), 5\u201350. https://doi.org/10.1093/jaenfo/jnac016"),
      blank(),
      ref("Tirole, J. (2024). Competition and industrial policy in the 21st century. Oxford Open Economics, 3(Supplement_1), i983\u2013i1001. https://doi.org/10.1093/ooec/odae012"),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('C:/AfriserveBackend/ECON_improved.docx', buf);
  fs.writeFileSync('C:/AfriserveBackend/build_econ_result.txt', 'SUCCESS');
}).catch(err => {
  fs.writeFileSync('C:/AfriserveBackend/build_econ_result.txt', 'ERROR: ' + err.message + '\n' + err.stack);
  process.exit(1);
});
