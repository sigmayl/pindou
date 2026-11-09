# Local multi-arch build helper.
#   docker buildx bake
#   docker buildx bake --set "*.platform=linux/arm64" --load
# The CI workflow builds the same two images with metadata tags.

variable "REGISTRY" {
  default = "ghcr.io"
}

variable "OWNER" {
  default = "sigmayl"
}

variable "TAG" {
  default = "local"
}

group "default" {
  targets = ["backend", "frontend"]
}

target "backend" {
  context    = "./backend"
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["${REGISTRY}/${OWNER}/pindou-backend:${TAG}"]
  args = {
    INSTALL_RMBG = "true"
  }
}

target "frontend" {
  context    = "./frontend"
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["${REGISTRY}/${OWNER}/pindou-frontend:${TAG}"]
  args = {
    VITE_API_BASE_URL = ""
  }
}
