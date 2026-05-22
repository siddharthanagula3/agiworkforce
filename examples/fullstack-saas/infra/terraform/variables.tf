variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  type    = string
  default = "fullstack-saas"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "container_image" {
  type        = string
  description = "Fully qualified image URI pushed by CI."
}

variable "domain_name" {
  type        = string
  default     = ""
  description = "Optional CloudFront alias, for example app.example.com."
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate in us-east-1 for CloudFront aliases."
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.40.0.0/20", "10.40.16.0/20"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.40.128.0/20", "10.40.144.0/20"]
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "min_count" {
  type    = number
  default = 2
}

variable "max_count" {
  type    = number
  default = 8
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}

variable "environment_variables" {
  type = map(string)
  default = {
    NODE_ENV        = "production"
    LOG_LEVEL       = "info"
    ALLOWED_ORIGINS = "https://app.example.com"
  }
}

variable "secret_arns" {
  type        = map(string)
  default     = {}
  description = "Map of container environment variable name to Secrets Manager ARN."
}

variable "redis_auth_token" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Optional Redis AUTH token. Store real values outside VCS."
}
