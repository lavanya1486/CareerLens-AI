package com.careerlens.report;

import com.careerlens.ai.AiDtos;
import com.careerlens.comparison.dto.ComparisonDetail;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.CharsetEncoder;
import java.text.Normalizer;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Renders a multi-page PDF report exclusively from a stored comparison. Text is sanitised to the
 * WinAnsi character set of the built-in fonts so unusual characters can never break rendering.
 */
@Service
public class PdfReportService {

    private static final Color SAGE = new Color(0x4F, 0x6F, 0x52);
    private static final Color SAGE_LIGHT = new Color(0xE6, 0xEE, 0xE3);
    private static final Color CREAM = new Color(0xFB, 0xF7, 0xEE);
    private static final Color YELLOW = new Color(0xE9, 0xC9, 0x6B);
    private static final Color INK = new Color(0x2B, 0x2F, 0x2A);
    private static final Color MUTED = new Color(0x6B, 0x70, 0x68);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy, HH:mm 'UTC'", Locale.ENGLISH)
            .withZone(ZoneOffset.UTC);
    private static final Map<String, String> REPLACEMENTS = Map.ofEntries(
            Map.entry("\u2192", "->"), Map.entry("\u2265", ">="), Map.entry("\u2264", "<="), Map.entry("\u2248", "~"),
            Map.entry("\u2713", "[x]"), Map.entry("\u2717", "[ ]"), Map.entry("\u00a0", " "), Map.entry("\u2212", "-"),
            // Letters without a Unicode decomposition that would otherwise become '?'.
            Map.entry("\u0141", "L"), Map.entry("\u0142", "l"), Map.entry("\u0110", "D"), Map.entry("\u0111", "d"),
            Map.entry("\u0131", "i"), Map.entry("\u0127", "h"), Map.entry("\u0126", "H"));

    private final Font titleFont = font(BaseFont.HELVETICA_BOLD, 20, INK);
    private final Font h2 = font(BaseFont.HELVETICA_BOLD, 13, SAGE);
    private final Font h3 = font(BaseFont.HELVETICA_BOLD, 10.5f, INK);
    private final Font body = font(BaseFont.HELVETICA, 9.5f, INK);
    private final Font small = font(BaseFont.HELVETICA, 8.5f, MUTED);
    private final Font bold = font(BaseFont.HELVETICA_BOLD, 9.5f, INK);
    private final Font scoreFont = font(BaseFont.HELVETICA_BOLD, 34, SAGE);
    private final Font headerCell = font(BaseFont.HELVETICA_BOLD, 9, Color.WHITE);

    public byte[] render(ComparisonDetail d) {
        AiDtos.AnalysisResult r = d.result();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A4, 48, 48, 54, 54);
        try {
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            writer.setPageEvent(new Footer(clean(d.name())));
            doc.addTitle(clean("CareerLens AI report - " + d.name()));
            doc.addCreator("CareerLens AI");
            doc.open();

            header(doc, d);
            overall(doc, d, r);
            components(doc, r);
            matching(doc, r);
            missing(doc, r, "required", "Missing required skills");
            missing(doc, r, "preferred", "Missing preferred skills");
            partial(doc, r);
            projects(doc, r);
            evidence(doc, r);
            qualifications(doc, r);
            recommendations(doc, r);
            methodology(doc, r);
            doc.close();
        } catch (DocumentException e) {
            throw new IllegalStateException("PDF report generation failed", e);
        }
        return out.toByteArray();
    }

    // ------------------------------------------------------------------ sections
    private void header(Document doc, ComparisonDetail d) {
        Paragraph brand = new Paragraph("CAREERLENS AI", font(BaseFont.HELVETICA_BOLD, 9, SAGE));
        brand.setSpacingAfter(4);
        doc.add(brand);
        doc.add(new Paragraph("Resume & Job Description Alignment Report", titleFont));
        PdfPTable meta = new PdfPTable(new float[] {1.2f, 3f});
        meta.setWidthPercentage(100);
        meta.setSpacingBefore(10);
        metaRow(meta, "Comparison", d.name());
        metaRow(meta, "Job title", orDash(d.jobTitle()));
        metaRow(meta, "Company", orDash(d.company()));
        metaRow(meta, "Resume", orDash(d.resumeTitle()));
        metaRow(meta, "Analysis date", DATE.format(d.createdAt()));
        metaRow(meta, "Versions", "Scoring " + d.scoringVersion() + " | Analysis " + d.analysisVersion()
                + " | Taxonomy " + d.taxonomyVersion());
        metaRow(meta, "Embedding model", d.modelName());
        doc.add(meta);
    }

    private void overall(Document doc, ComparisonDetail d, AiDtos.AnalysisResult r) {
        PdfPTable box = new PdfPTable(new float[] {1.1f, 3f});
        box.setWidthPercentage(100);
        box.setSpacingBefore(14);
        PdfPCell score = new PdfPCell();
        score.setBackgroundColor(CREAM);
        score.setBorderColor(YELLOW);
        score.setBorderWidth(1.5f);
        score.setPadding(10);
        score.setHorizontalAlignment(Element.ALIGN_CENTER);
        Paragraph sp = new Paragraph(String.format(Locale.ROOT, "%.0f", r.overallScore()), scoreFont);
        sp.setAlignment(Element.ALIGN_CENTER);
        score.addElement(sp);
        Paragraph of = new Paragraph("out of 100 - " + clean(r.scoreBand()) + " alignment", small);
        of.setAlignment(Element.ALIGN_CENTER);
        score.addElement(of);
        box.addCell(score);
        PdfPCell summary = new PdfPCell();
        summary.setBorderColor(SAGE_LIGHT);
        summary.setPadding(10);
        summary.addElement(new Paragraph("Overall alignment", h3));
        summary.addElement(new Paragraph(clean(r.summary()), body));
        Paragraph note = new Paragraph("This score describes how well the resume text aligns with this job description. "
                + "It is not a probability of being interviewed or hired.", small);
        note.setSpacingBefore(6);
        summary.addElement(note);
        box.addCell(summary);
        doc.add(box);
    }

    private void components(Document doc, AiDtos.AnalysisResult r) {
        section(doc, "Component scores");
        PdfPTable t = table(new float[] {2.2f, 0.8f, 0.8f, 0.9f, 4f}, "Component", "Score", "Weight", "Points", "How it was calculated");
        for (AiDtos.ComponentScore c : r.components()) {
            t.addCell(cell(c.label(), bold));
            t.addCell(cell(c.available() ? fmt(c.score()) : "n/a", body));
            t.addCell(cell(c.available() ? String.format(Locale.ROOT, "%.0f%%", c.effectiveWeight() * 100) : "-", body));
            t.addCell(cell(c.available() ? fmt(c.contribution()) : "-", body));
            t.addCell(cell(c.explanation(), small));
        }
        doc.add(t);
    }

    private void matching(Document doc, AiDtos.AnalysisResult r) {
        List<AiDtos.SkillMatch> matched = r.skillMatches().stream().filter(m -> m.status().equals("matched")).toList();
        section(doc, "Matching skills (" + matched.size() + ")");
        if (matched.isEmpty()) {
            doc.add(new Paragraph("No job requirements were explicitly evidenced in the resume.", body));
            return;
        }
        PdfPTable t = table(new float[] {1.6f, 0.9f, 1.1f, 4.4f}, "Skill", "Priority", "Evidence", "Resume evidence");
        for (AiDtos.SkillMatch m : matched) {
            String label = m.skill() + (m.matchedVia() != null && !m.matchedVia().equals(m.skill()) ? " (via " + m.matchedVia() + ")" : "");
            t.addCell(cell(label, bold));
            t.addCell(cell(m.importance(), body));
            t.addCell(cell(m.evidenceStrength(), body));
            String ev = m.resumeEvidence().isEmpty() ? "-"
                    : m.resumeEvidence().get(0).sectionLabel() + ": \"" + m.resumeEvidence().get(0).text() + "\"";
            t.addCell(cell(ev, small));
        }
        doc.add(t);
    }

    private void missing(Document doc, AiDtos.AnalysisResult r, String importance, String title) {
        List<AiDtos.SkillMatch> list = r.skillMatches().stream()
                .filter(m -> m.importance().equals(importance) && (m.status().equals("missing") || m.status().equals("review")))
                .toList();
        section(doc, title + " (" + list.size() + ")");
        if (list.isEmpty()) {
            doc.add(new Paragraph("None - every " + importance + " skill has at least partial evidence.", body));
            return;
        }
        doc.add(new Paragraph("A skill missing from the resume does not prove the candidate lacks it; the document simply "
                + "does not show it.", small));
        PdfPTable t = table(new float[] {1.5f, 0.9f, 3.2f, 2.4f}, "Skill", "Status", "Job requirement", "Next step");
        for (AiDtos.SkillMatch m : list) {
            t.addCell(cell(m.skill() + (m.alternatives().isEmpty() ? "" : " (or " + String.join(", ", m.alternatives()) + ")"), bold));
            t.addCell(cell(m.status().equals("review") ? "needs review" : "missing", body));
            t.addCell(cell(m.jobEvidence(), small));
            t.addCell(cell(m.nextStep(), small));
        }
        doc.add(t);
    }

    private void partial(Document doc, AiDtos.AnalysisResult r) {
        List<AiDtos.SkillMatch> list = r.skillMatches().stream().filter(m -> m.status().equals("partial")).toList();
        section(doc, "Partial matches (" + list.size() + ")");
        if (list.isEmpty()) {
            doc.add(new Paragraph("No related-but-distinct technologies were credited partially.", body));
            return;
        }
        PdfPTable t = table(new float[] {1.4f, 1.4f, 4.2f}, "Required skill", "Related in resume", "Why it is not a full match");
        for (AiDtos.SkillMatch m : list) {
            t.addCell(cell(m.skill(), bold));
            t.addCell(cell(String.join(", ", m.relatedResumeSkills()), body));
            t.addCell(cell(m.reasoning(), small));
        }
        doc.add(t);
    }

    private void projects(Document doc, AiDtos.AnalysisResult r) {
        section(doc, "Relevant projects");
        if (r.projects().isEmpty()) {
            doc.add(new Paragraph("No projects section was detected in the resume, so project relevance could not be assessed.", body));
            return;
        }
        for (AiDtos.ProjectAnalysis p : r.projects()) {
            Paragraph title = new Paragraph();
            title.add(new Chunk("#" + p.rank() + "  " + clean(p.name()), h3));
            title.add(new Chunk("   relevance " + fmt(p.relevanceScore()) + " / 100", small));
            title.setSpacingBefore(6);
            doc.add(title);
            doc.add(new Paragraph(clean(p.explanation()), body));
            if (!p.technologies().isEmpty()) {
                doc.add(new Paragraph("Technologies: " + clean(String.join(", ", p.technologies())), small));
            }
            bullets(doc, "Evidence", p.evidence());
            bullets(doc, "Missing evidence / uncertainty", p.missingEvidence());
            bullets(doc, "Ideas for future work (not yet completed)", p.futureImprovements());
        }
    }

    private void evidence(Document doc, AiDtos.AnalysisResult r) {
        section(doc, "Supporting evidence for key job statements");
        doc.add(new Paragraph("Each job statement is compared with every resume line using sentence embeddings; the closest "
                + "line is shown with its cosine similarity. Semantic similarity never credits a skill on its own.", small));
        PdfPTable t = table(new float[] {3f, 3f, 1.1f}, "Job statement", "Closest resume evidence", "Alignment");
        int rows = 0;
        for (AiDtos.Alignment a : r.alignments()) {
            if (rows++ >= 25) {
                break;
            }
            t.addCell(cell(a.requirement(), small));
            t.addCell(cell(a.bestEvidence() == null ? "-" : a.bestEvidence().sectionLabel() + ": " + a.bestEvidence().text(), small));
            t.addCell(cell(a.classification() + String.format(Locale.ROOT, " (%.2f)", a.similarity()), body));
        }
        doc.add(t);
    }

    private void qualifications(Document doc, AiDtos.AnalysisResult r) {
        section(doc, "Experience & qualifications (manual review)");
        doc.add(new Paragraph(clean(r.experience().explanation()), body));
        if (!r.qualifications().isEmpty()) {
            PdfPTable t = table(new float[] {1f, 3f, 1.1f, 3f}, "Type", "Requirement", "Status", "Reasoning");
            for (AiDtos.QualificationCheck q : r.qualifications()) {
                t.addCell(cell(q.kind(), body));
                t.addCell(cell(q.requirement(), small));
                t.addCell(cell(q.status().replace('_', ' '), body));
                t.addCell(cell(q.reasoning(), small));
            }
            doc.add(t);
        }
    }

    private void recommendations(Document doc, AiDtos.AnalysisResult r) {
        section(doc, "Actionable recommendations");
        if (r.recommendations().isEmpty()) {
            doc.add(new Paragraph("No recommendations were generated.", body));
            return;
        }
        for (AiDtos.Recommendation rec : r.recommendations()) {
            Paragraph p = new Paragraph();
            p.setSpacingBefore(5);
            p.add(new Chunk("[" + rec.priority().toUpperCase(Locale.ROOT) + "] ", font(BaseFont.HELVETICA_BOLD, 8.5f, SAGE)));
            p.add(new Chunk(clean(rec.title()), bold));
            doc.add(p);
            doc.add(new Paragraph(clean(rec.detail()), body));
            for (String g : rec.grounding()) {
                Paragraph gp = new Paragraph("Based on: " + clean(g), small);
                gp.setIndentationLeft(10);
                doc.add(gp);
            }
        }
    }

    private void methodology(Document doc, AiDtos.AnalysisResult r) {
        section(doc, "Scoring methodology");
        for (String line : r.calculation()) {
            Paragraph p = new Paragraph(clean(line), body);
            p.setIndentationLeft(8);
            doc.add(p);
        }
        for (AiDtos.MethodologyNote n : r.methodology()) {
            Paragraph t = new Paragraph(clean(n.title()), h3);
            t.setSpacingBefore(6);
            doc.add(t);
            doc.add(new Paragraph(clean(n.body()), body));
        }
        section(doc, "Model and scoring limitations");
        for (String l : r.limitations()) {
            doc.add(new Paragraph("\u2022 " + clean(l), body));
        }
    }

    // ------------------------------------------------------------------ helpers
    private void section(Document doc, String title) {
        Paragraph p = new Paragraph(clean(title), h2);
        p.setSpacingBefore(16);
        p.setSpacingAfter(6);
        doc.add(p);
    }

    private void bullets(Document doc, String label, List<String> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        Paragraph l = new Paragraph(clean(label), font(BaseFont.HELVETICA_BOLD, 8.5f, MUTED));
        l.setSpacingBefore(3);
        doc.add(l);
        for (String i : items) {
            Paragraph p = new Paragraph("\u2022 " + clean(i), body);
            p.setIndentationLeft(10);
            doc.add(p);
        }
    }

    private PdfPTable table(float[] widths, String... headers) {
        PdfPTable t = new PdfPTable(widths);
        t.setWidthPercentage(100);
        t.setHeaderRows(1);
        t.setSplitLate(true);
        t.setSplitRows(true);
        t.setSpacingBefore(4);
        for (String h : headers) {
            PdfPCell c = new PdfPCell(new Phrase(clean(h), headerCell));
            c.setBackgroundColor(SAGE);
            c.setBorderColor(SAGE);
            c.setPadding(5);
            t.addCell(c);
        }
        return t;
    }

    private PdfPCell cell(String text, Font f) {
        PdfPCell c = new PdfPCell(new Phrase(clean(text), f));
        c.setPadding(5);
        c.setBorderColor(SAGE_LIGHT);
        return c;
    }

    private void metaRow(PdfPTable t, String key, String value) {
        PdfPCell k = cell(key, small);
        k.setBorder(Rectangle.BOTTOM);
        PdfPCell v = cell(value, body);
        v.setBorder(Rectangle.BOTTOM);
        t.addCell(k);
        t.addCell(v);
    }

    private static Font font(String name, float size, Color color) {
        try {
            return new Font(BaseFont.createFont(name, BaseFont.WINANSI, BaseFont.NOT_EMBEDDED), size, Font.NORMAL, color);
        } catch (Exception e) {
            throw new IllegalStateException("Built-in PDF font unavailable: " + name, e);
        }
    }

    private static String fmt(double v) {
        return String.format(Locale.ROOT, "%.1f", v);
    }

    private static String orDash(String s) {
        return s == null || s.isBlank() ? "-" : s;
    }

    /** Converts text to characters the WinAnsi built-in fonts can render; others become '?'. */
    static String clean(String input) {
        if (input == null) {
            return "";
        }
        String s = input;
        for (Map.Entry<String, String> e : REPLACEMENTS.entrySet()) {
            s = s.replace(e.getKey(), e.getValue());
        }
        CharsetEncoder enc = Charset.forName("windows-1252").newEncoder();
        StringBuilder sb = new StringBuilder(s.length());
        s.codePoints().forEach(cp -> {
            if (cp == '\n' || cp == '\t') {
                sb.append(' ');
                return;
            }
            if (Character.isISOControl(cp)) {
                return;
            }
            String ch = new String(Character.toChars(cp));
            if (enc.canEncode(ch)) {
                sb.append(ch);
                return;
            }
            String decomposed = Normalizer.normalize(ch, Normalizer.Form.NFKD).replaceAll("\\p{M}", "");
            sb.append(!decomposed.isEmpty() && enc.canEncode(decomposed) ? decomposed : "?");
        });
        return sb.toString();
    }

    /** Page footer with the comparison name and page number on every page. */
    private final class Footer extends PdfPageEventHelper {
        private final String name;

        Footer(String name) {
            this.name = name.length() > 70 ? name.substring(0, 70) + "..." : name;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfContentByte cb = writer.getDirectContent();
            float y = document.bottom() - 24;
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, new Phrase("CareerLens AI - " + name, small),
                    document.left(), y, 0);
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, new Phrase("Page " + writer.getPageNumber(), small),
                    document.right(), y, 0);
        }
    }
}
