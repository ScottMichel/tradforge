/** An Android resource file written for the tests. */
export const strings = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">
    <!-- Main window -->
    <string name="app_name">The Cold Forge</string>
    <string name="welcome">Welcome back, <xliff:g id="name" example="Bob">%1$s</xliff:g>! It\\'s cold.</string>
    <string name="logo" translatable="false">FORGE</string>
    <string name="long">A long text
        on two lines</string>
    <string name="spaced">"  Keep   these spaces  "</string>
    <string name="styled">Press <b>Quit</b> to leave &amp; rest</string>
    <string name="ref">\\@forge and \\"quotes\\"\\nNew line</string>
    <string name="empty"></string>
    <string-array name="days">
        <item>Monday</item>
        <item>Tuesday</item>
    </string-array>
    <plurals name="bars">
        <item quantity="one">%d bar left</item>
        <item quantity="other">%d bars left</item>
    </plurals>
    <color name="fire">#FF4500</color>
</resources>
`;
