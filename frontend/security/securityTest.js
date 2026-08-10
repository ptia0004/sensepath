/**
 * ==========================================================
 * SensePath Security Module Tests
 * securityTest.js
 *
 * Author: Chunyi Wang
 * Role: Testing & Security
 *
 * Description:
 * Basic test cases for SecurityValidator.
 * ==========================================================
 */

function runSecurityTests() {

    const testCases = [
        {
            name: "Normal note",
            input: "Loud construction near Swanston Street.",
            expected: true
        },
        {
            name: "Empty input",
            input: "     ",
            expected: false
        },
        {
            name: "Maximum valid length",
            input: "A".repeat(300),
            expected: true
        },
        {
            name: "Input exceeds maximum length",
            input: "A".repeat(301),
            expected: false
        },
        {
            name: "Script tag attack",
            input: "<script>alert('XSS')</script>",
            expected: false
        },
        {
            name: "JavaScript URL attack",
            input: "javascript:alert('XSS')",
            expected: false
        },
        {
            name: "Image onerror attack",
            input: "<img src='x' onerror='alert(1)'>",
            expected: false
        },
        {
            name: "Body onload attack",
            input: "<body onload='alert(1)'>",
            expected: false
        },
        {
            name: "Iframe injection",
            input: "<iframe src='malicious.html'></iframe>",
            expected: false
        },
        {
            name: "Normal punctuation",
            input: "Very loud near the tram stop, around 2:00–3:00 pm.",
            expected: true
        }
    ];

    let passed = 0;
    let failed = 0;

    console.log("==========================================");
    console.log("SensePath Security Validation Tests");
    console.log("==========================================");

    testCases.forEach((testCase, index) => {

        const result = SecurityValidator.validateNote(testCase.input);
        const success = result.valid === testCase.expected;

        if (success) {
            passed++;
            console.log(
                `PASS ${index + 1}: ${testCase.name}`
            );
        } else {
            failed++;
            console.error(
                `FAIL ${index + 1}: ${testCase.name}`,
                {
                    expected: testCase.expected,
                    actual: result.valid,
                    message: result.message,
                    input: testCase.input
                }
            );
        }

    });

    console.log("------------------------------------------");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${testCases.length}`);
    console.log("------------------------------------------");

    if (failed === 0) {
        console.log("All security tests passed.");
    } else {
        console.error("Some security tests failed.");
    }

}

runSecurityTests();