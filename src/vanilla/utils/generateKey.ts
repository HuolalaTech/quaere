const prefix = `$q$`
let idCount = 0

export const generatekey = () => {
  return `${prefix}${++idCount}`
}

export const isGeneratedKey = (key: string) => {
  return key.startsWith(prefix)
}
