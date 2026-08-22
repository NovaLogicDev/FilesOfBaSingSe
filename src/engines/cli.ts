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
   * Generates direct HTTPS cURL download command.
   * Format:
   * curl -X GET \
   *   "https://storage.googleapis.com/storage/v1/b/BUCKET/o/PATH?alt=media&userProject=PROJECT_ID" \
   *   -H "Authorization: Bearer TOKEN" \
   *   -o "filename"
   */
  public static generateCurlCommand(options: CLIGeneratorOptions & { oauthToken?: string }): string {
    const { bucketName, selectedPaths, userProject, oauthToken } = options
    const cleanBucket = this.cleanBucketName(bucketName)
    const tokenExpression = oauthToken ? oauthToken : '$(gcloud auth print-access-token)'
    const project = userProject || 'YOUR_GCP_PROJECT_ID'

    if (!selectedPaths || selectedPaths.length === 0) {
      return `curl -X GET \\\n  "https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        cleanBucket,
      )}/o?userProject=${encodeURIComponent(project)}" \\\n  -H "Authorization: Bearer ${tokenExpression}"`
    }

    if (selectedPaths.length === 1) {
      const path = selectedPaths[0].replace(/^\/+/, '')
      const filename = path.includes('/') ? path.split('/').pop()! : path
      return `curl -X GET \\\n  "https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        cleanBucket,
      )}/o/${encodeURIComponent(path)}?alt=media&userProject=${encodeURIComponent(
        project,
      )}" \\\n  -H "Authorization: Bearer ${tokenExpression}" \\\n  -o "${filename}"`
    }

    // Multi-item script
    return selectedPaths
      .map((p) => {
        const cleanPath = p.replace(/^\/+/, '')
        const filename = cleanPath.includes('/') ? cleanPath.split('/').pop()! : cleanPath
        return `curl -X GET "https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
          cleanBucket,
        )}/o/${encodeURIComponent(cleanPath)}?alt=media&userProject=${encodeURIComponent(
          project,
        )}" -H "Authorization: Bearer ${tokenExpression}" -o "${filename}"`
      })
      .join(' && \\\n')
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
