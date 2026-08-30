import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A rich-text field holds HTML.
 *
 * anydb-ui edits these with a TipTap editor: it parses the stored value as
 * HTML (content={props.value}) and saves editor.getHTML() back. So a value
 * written as plain text with newlines is parsed as HTML, where newlines are
 * only whitespace, and renders as one unbroken run. Nothing errors and nothing
 * is lost — the field just looks like it forgot its formatting, which is how
 * this went unnoticed.
 *
 * The guide has to say so, because the failure gives no signal at write time.
 */
describe("rich-text guidance", () => {
  const guide = () =>
    readFileSync(
      resolve(process.cwd(), "resources/solution-building-v1.md"),
      "utf8",
    );

  it("states that rich-text stores HTML", () => {
    expect(guide()).toContain(
      "**A `rich-text` field stores HTML, not plain text.**",
    );
  });

  it("connects it to the label a user would recognise", () => {
    // Someone reading the app sees "long text", not "rich-text", so the guide
    // has to bridge the two names or the rule looks like it is about
    // something else.
    expect(guide()).toMatch(/labelled "long\s+text" in the app/);
  });

  it("says newlines and Markdown both do nothing", () => {
    const text = guide();

    // The two things an agent reaches for instead of tags.
    expect(text).toMatch(/Newline characters do nothing/);
    expect(text).toMatch(/Markdown does not work either/);
    expect(text).toMatch(/renders as literal asterisks/);
  });

  it("says it applies to writing records, not only to defining types", () => {
    // The guide is read for type authoring, but the failure happens when
    // writing a record value — so the bullet has to reach past its usual
    // audience.
    expect(guide()).toMatch(
      /applies when writing record values through\s+`create_record` and `update_record`/,
    );
  });

  it("shows the right and wrong form side by side", () => {
    expect(guide()).toContain(
      "Write `<p>First line</p><p>Second line</p>`",
    );
  });
});
