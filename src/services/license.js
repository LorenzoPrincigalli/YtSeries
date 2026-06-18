class LicenseService {
  async verify() {
    return { valid: false }
  }
}

const licenseService = new LicenseService()
export { licenseService }
