let homePage = 1

export function readHomePage(): number {
  return homePage
}

export function saveHomePage(page: number): void {
  homePage = page
}
