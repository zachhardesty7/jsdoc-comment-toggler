export const foo = () => {
  const foo2 = () => {
    const foo3 = () => {
      const HTMLElementNeedingCast = document.querySelector(".foo")
      /**  */ HTMLElementNeedingCast.click()
    }
  }
}
