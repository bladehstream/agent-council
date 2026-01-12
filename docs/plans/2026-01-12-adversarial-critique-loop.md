# Adversarial Critique Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional critique phase that improves output quality through adversarial review for both compete and merge pipeline modes.

**Architecture:** The critique loop adds 2 optional stages after the initial draft is produced: (1) Critics review the draft in parallel, (2) Chairman merges critiques and applies blocking fixes while logging advisory concerns. Human confirmation mode allows pausing before applying fixes.

**Tech Stack:** TypeScript, existing agent-council pipeline infrastructure, readline for user confirmation prompts.

---

## Summary

This implementation adds an adversarial critique loop to agent-council. The feature is documented in detail above. Implementation will proceed in order through the tasks below.
