/**
 * tests/web/setup.ts
 *
 * Extends vitest's `expect` with @testing-library/jest-dom matchers
 * (toBeInTheDocument, toBeDisabled, toHaveAttribute, etc.)
 * Runs before every test file matched by tests/web/**
 */
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

expect.extend(matchers);
