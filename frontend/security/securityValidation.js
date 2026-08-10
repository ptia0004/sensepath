/**
 * ==========================================================
 * SensePath Security Module
 * securityValidation.js
 *
 * Author: Chunyi Wang
 * Role: Testing & Security
 *
 * Description:
 * Reusable client-side validation module for SensePath.
 * This module provides input validation and basic protection
 * against common dangerous user-input patterns.
 *
 * Important:
 * Client-side validation improves usability and provides an
 * additional security layer, but it must not replace
 * server-side validation.
 * ==========================================================
 */

class SecurityValidator {

    /**
     * Normalize input by converting non-string values to an
     * empty string and removing leading/trailing whitespace.
     *
     * @param {*} text
     * @returns {string}
     */
    static normalize(text) {
        if (typeof text !== "string") {
            return "";
        }

        return text.trim();
    }

    /**
     * Check whether the input contains meaningful content.
     *
     * This function remains reusable for future required
     * fields, although the current report note is optional.
     *
     * @param {*} text
     * @returns {boolean}
     */
    static validateEmpty(text) {
        const value = this.normalize(text);

        return value.length > 0;
    }

    /**
     * Check whether the input is within the allowed length.
     *
     * @param {*} text
     * @param {number} maxLength
     * @returns {boolean}
     */
    static validateLength(text, maxLength = 300) {
        const value = this.normalize(text);

        return value.length <= maxLength;
    }

    /**
     * Detect common dangerous input patterns.
     *
     * This includes basic checks for common XSS-related
     * payloads such as script tags, event handlers,
     * dangerous URLs, iframes and embedded objects.
     *
     * @param {*} text
     * @returns {boolean}
     */
    static validateDangerousInput(text) {
        const value = this.normalize(text);

        const dangerousPatterns = [
            /<\s*script\b/i,
            /javascript\s*:/i,
            /\bonerror\s*=/i,
            /\bonload\s*=/i,
            /<\s*iframe\b/i,
            /<\s*object\b/i,
            /<\s*embed\b/i,
            /document\s*\.\s*cookie/i,
            /window\s*\.\s*location/i
        ];

        const dangerousContentFound = dangerousPatterns.some(
            pattern => pattern.test(value)
        );

        return !dangerousContentFound;
    }

    /**
     * Validate the optional community report note.
     *
     * Business rules:
     * - Empty notes are allowed because the field is optional.
     * - Non-empty notes must be no longer than 300 characters.
     * - Dangerous input patterns must be rejected.
     *
     * @param {*} text
     * @returns {{valid: boolean, message: string}}
     */
    static validateNote(text) {
        const value = this.normalize(text);

        // The note is optional, so empty input is valid.
        if (value === "") {
            return {
                valid: true,
                message: "Empty note allowed."
            };
        }

        if (!this.validateLength(value, 300)) {
            return {
                valid: false,
                message: "Input exceeds the maximum length of 300 characters."
            };
        }

        if (!this.validateDangerousInput(value)) {
            return {
                valid: false,
                message: "Potentially dangerous input detected."
            };
        }

        return {
            valid: true,
            message: "Validation passed."
        };
    }
}