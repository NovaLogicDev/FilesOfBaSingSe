export interface CLIOptions {
  bucketName: string
  selectedPaths: string[]
  userProject: string
  destinationDir?: string
}

export interface CLIGeneratorOptions extends CLIOptions {
  includeRecursive?: boolean
}
