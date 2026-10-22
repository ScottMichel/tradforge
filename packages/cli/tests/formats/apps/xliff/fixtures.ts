/** XLIFF documents written for the tests: one of version 1.2, one of version 2.0. */
export const xliff12 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" datatype="plaintext" original="ng2.template">
    <body>
      <trans-unit id="title" datatype="html">
        <source>The Cold Forge</source>
        <note priority="1" from="description">Title of the main window</note>
      </trans-unit>
      <trans-unit id="welcome" datatype="html">
        <source> Welcome back, <x id="INTERPOLATION" equiv-text="{{ name }}"/>! Fish &amp; chips? </source>
        <target state="new"></target>
      </trans-unit>
      <group id="menu">
        <trans-unit id="quit">
          <source>Press <g id="1" ctype="bold">Quit</g> to leave &lt;now&gt;</source>
        </trans-unit>
        <trans-unit id="logo" translate="no">
          <source>FORGE</source>
        </trans-unit>
      </group>
      <trans-unit id="empty"><source>  </source></trans-unit>
    </body>
  </file>
</xliff>
`;

export const xliff20 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en">
  <file id="f1">
    <unit id="title">
      <notes>
        <note category="description">Title of the main window</note>
      </notes>
      <segment>
        <source>The Cold Forge</source>
      </segment>
    </unit>
    <unit id="story">
      <segment id="s1" state="initial">
        <source>The fire is out.</source>
        <target/>
      </segment>
      <ignorable>
        <source> </source>
      </ignorable>
      <segment id="s2">
        <source>Light it with <pc id="1">the <ph id="2" disp="{tool}"/></pc>.</source>
      </segment>
    </unit>
  </file>
</xliff>
`;
