import { describe, it, expect } from "vitest"
import * as cheerio from "cheerio"
import { checkAccessibility } from "./index"

describe("checkAccessibility — image alt", () => {
  it("flags images missing alt and includes src in element", () => {
    const issues = checkAccessibility(cheerio.load(`
      <img src="/hero.png">
      <img src="/logo.svg">
    `))
    const issue = issues.find((i) => i.id === "images-missing-alt")
    expect(issue).toBeDefined()
    expect(issue!.element).toContain(`<img src="/hero.png">`)
    expect(issue!.element).toContain(`<img src="/logo.svg">`)
  })

  it("does not flag images with alt (including empty decorative alt)", () => {
    const issues = checkAccessibility(cheerio.load(`
      <img src="/hero.png" alt="Hero image">
      <img src="/decorative.png" alt="">
    `))
    expect(issues.find((i) => i.id === "images-missing-alt")).toBeUndefined()
  })

  it("caps element list at 5 images and appends count", () => {
    const imgs = Array.from({ length: 8 }, (_, i) => `<img src="/img${i}.png">`).join("")
    const issues = checkAccessibility(cheerio.load(imgs))
    const issue = issues.find((i) => i.id === "images-missing-alt")
    expect(issue!.element).toContain("and 3 more")
  })
})

describe("checkAccessibility — form labels", () => {
  it("flags unlabelled inputs and includes input tag in element", () => {
    const issues = checkAccessibility(cheerio.load(`
      <form>
        <input type="email" id="email" name="email">
      </form>
    `))
    const issue = issues.find((i) => i.id === "form-inputs-missing-labels")
    expect(issue).toBeDefined()
    expect(issue!.element).toContain(`type="email"`)
    expect(issue!.element).toContain(`id="email"`)
  })

  it("passes inputs with associated labels", () => {
    const issues = checkAccessibility(cheerio.load(`
      <form>
        <label for="email">Email</label>
        <input type="email" id="email">
      </form>
    `))
    expect(issues.find((i) => i.id === "form-inputs-missing-labels")).toBeUndefined()
  })

  it("passes inputs with aria-label", () => {
    const issues = checkAccessibility(cheerio.load(`
      <form>
        <input type="search" aria-label="Search the site">
      </form>
    `))
    expect(issues.find((i) => i.id === "form-inputs-missing-labels")).toBeUndefined()
  })

  it("ignores hidden, submit, button, reset inputs", () => {
    const issues = checkAccessibility(cheerio.load(`
      <form>
        <input type="hidden" name="token">
        <input type="submit" value="Submit">
        <input type="button" value="Cancel">
        <input type="reset" value="Reset">
      </form>
    `))
    expect(issues.find((i) => i.id === "form-inputs-missing-labels")).toBeUndefined()
  })
})

describe("checkAccessibility — focus outline", () => {
  it("flags global outline:none in style tag", () => {
    const issues = checkAccessibility(cheerio.load(`
      <style>* { outline: none; color: red; }</style>
    `))
    const issue = issues.find((i) => i.id === "outline-removed")
    expect(issue).toBeDefined()
    expect(issue!.element).toContain("outline: none")
  })

  it("does not flag scoped outline:none", () => {
    const issues = checkAccessibility(cheerio.load(`
      <style>.btn { outline: none; }</style>
    `))
    expect(issues.find((i) => i.id === "outline-removed")).toBeUndefined()
  })
})
