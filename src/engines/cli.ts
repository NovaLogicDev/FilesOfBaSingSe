import { CLIGeneratorOptions } from '../types/cli'

/**
 * Automated Batch & CLI Companion Generator Engine
 * Constructs syntactically valid shell commands for modern Google Cloud CLI (gcloud storage)
 * and legacy gsutil with pre-populated client billing project parameters.
 */
export class CliGeneratorEngine {
  /**
   * Generates modern multi-threaded gcloud storage cp command.
   * Format:
   * gcloud storage cp \
   *   gs://BUCKET/path1 \
   *   gs://BUCKET/path2 \
   *   ./destination/ \
   *   --billing-project=PROJECT_ID
   */
  public static generateGcloudCommand(options: CLIGeneratorOptions): string {
    const {
      bucketName,
      selectedPaths,
      userProject,
      destinationDir = './destination_folder/',
      includeRecursive = false,
    } = options

    const cleanBucket = this.cleanBucketName(bucketName)
    const projectFlag = userProject ? `--billing-project=${userProject}` : '--billing-project=YOUR_GCP_PROJECT_ID'
    const recursiveFlag = includeRecursive ? ' --recursive' : ''

    if (!selectedPaths || selectedPaths.length === 0) {
      return `gcloud storage cp gs://${cleanBucket}/* ${destinationDir}${recursiveFlag} ${projectFlag}`
    }

    if (selectedPaths.length === 1) {
      const path = this.escapeShellArg(selectedPaths[0])
      return `gcloud storage cp gs://${cleanBucket}/${path} ${destinationDir}${recursiveFlag} ${projectFlag}`
    }

    const formattedPaths = selectedPaths
      .map((p) => `  gs://${cleanBucket}/${this.escapeShellArg(p)}`)
      .join(' \\\n')

    return `gcloud storage cp${recursiveFlag} \\\n${formattedPaths} \\\n  ${destinationDir} \\\n  ${projectFlag}`
  }

  /**
   * Generates legacy multi-threaded gsutil cp command.
   * Format:
   * gsutil -u PROJECT_ID -m cp \
   *   gs://BUCKET/path1 \
   *   ./destination/
   */
  public static generateGsutilCommand(options: CLIGeneratorOptions): string {
    const {
      bucketName,
      selectedPaths,
      userProject,
      destinationDir = './',
      includeRecursive = false,
    } = options

    const cleanBucket = this.cleanBucketName(bucketName)
    const projectFlag = userProject ? `-u ${userProject}` : '-u YOUR_GCP_PROJECT_ID'
    const recursiveFlag = includeRecursive ? ' -r' : ''

    if (!selectedPaths || selectedPaths.length === 0) {
      return `gsutil ${projectFlag} -m cp${recursiveFlag} gs://${cleanBucket}/* ${destinationDir}`
    }

    if (selectedPaths.length === 1) {
      const path = this.escapeShellArg(selectedPaths[0])
      return `gsutil ${projectFlag} -m cp${recursiveFlag} gs://${cleanBucket}/${path} ${destinationDir}`
    }

    const formattedPaths = selectedPaths
      .map((p) => `  gs://${cleanBucket}/${this.escapeShellArg(p)}`)
      .join(' \\\n')

    return `gsutil ${projectFlag} -m cp${recursiveFlag} \\\n${formattedPaths} \\\n  ${destinationDir}`
  }

  /**
   * Cleans bucket name by stripping gs:// prefix and trailing slashes.
   */
  public static cleanBucketName(bucket: string): string {
    if (!bucket) return 'your-bucket-name'
    return bucket.replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim()
  }

  /**
   * Safely escapes shell arguments containing spaces or special characters.
   */
  public static escapeShellArg(arg: string): string {
    if (!arg) return ''
    if (/^[a-zA-Z0-9_\-./]+$/.test(arg)) {
      return arg
    }
    return `"${arg.replace(/"/g, '\\"')}"`
  }
}
