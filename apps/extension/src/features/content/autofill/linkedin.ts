export const LINKEDIN_SELECTORS: Record<string, string[]> = {
  firstName: [
    'input[name="firstName"]',
    'input[id*="first-name"]',
    'input[id*="firstName"]',
    'input[aria-label*="First name" i]',
    'input[aria-label*="First Name" i]',
    'input[placeholder*="First name" i]',
  ],
  lastName: [
    'input[name="lastName"]',
    'input[id*="last-name"]',
    'input[id*="lastName"]',
    'input[aria-label*="Last name" i]',
    'input[aria-label*="Last Name" i]',
    'input[placeholder*="Last name" i]',
  ],
  email: [
    'input[name="email"]',
    'input[type="email"]',
    'input[id*="email"]',
    'input[aria-label*="Email" i]',
    'input[placeholder*="Email" i]',
  ],
  phone: [
    'input[name="phoneNumber"]',
    'input[type="tel"]',
    'input[id*="phone"]',
    'input[aria-label*="Phone" i]',
    'input[aria-label*="Mobile" i]',
    'input[placeholder*="Phone" i]',
  ],
  linkedinUrl: [
    'input[name="linkedInUrl"]',
    'input[id*="linkedin-url"]',
    'input[aria-label*="LinkedIn" i]',
    'input[placeholder*="linkedin.com" i]',
  ],
  githubUrl: [
    'input[name="githubUrl"]',
    'input[aria-label*="GitHub" i]',
    'input[aria-label*="Github" i]',
    'input[placeholder*="github.com" i]',
  ],
  portfolioUrl: [
    'input[name="portfolioUrl"]',
    'input[name="websiteUrl"]',
    'input[aria-label*="Portfolio" i]',
    'input[aria-label*="Website" i]',
    'input[placeholder*="portfolio" i]',
    'input[placeholder*="website" i]',
  ],
  currentTitle: [
    'input[name="jobTitle"]',
    'input[name="currentTitle"]',
    'input[id*="job-title"]',
    'input[aria-label*="Current title" i]',
    'input[aria-label*="Job title" i]',
    'input[placeholder*="title" i]',
  ],
  currentCompany: [
    'input[name="company"]',
    'input[name="currentCompany"]',
    'input[id*="company"]',
    'input[aria-label*="Company" i]',
    'input[aria-label*="Employer" i]',
    'input[placeholder*="company" i]',
  ],
  locationCity: [
    'input[name="city"]',
    'input[id*="city"]',
    'input[aria-label*="City" i]',
    'input[placeholder*="city" i]',
  ],
  salaryExpectation: [
    'input[name="salary"]',
    'input[id*="salary"]',
    'input[aria-label*="Salary" i]',
    'input[aria-label*="Expected" i]',
    'input[placeholder*="salary" i]',
  ],
  yearsOfExperience: [
    'input[name="yearsOfExperience"]',
    'input[id*="years-of-experience"]',
    'input[aria-label*="Years of experience" i]',
    'input[aria-label*="Experience" i]',
  ],
  coverLetterText: [
    'textarea[name="coverLetter"]',
    'textarea[id*="cover-letter"]',
    'textarea[aria-label*="Cover letter" i]',
    'textarea[placeholder*="cover letter" i]',
    'textarea[placeholder*="Cover Letter" i]',
  ],
  resumeText: [
    'textarea[name="resume"]',
    'textarea[aria-label*="Resume" i]',
    'textarea[placeholder*="resume" i]',
    'textarea[aria-label*="CV" i]',
  ],
  workAuthorization: [
    'select[name="workAuthorization"]',
    'select[id*="work-authorization"]',
    'select[aria-label*="Work authorization" i]',
    'select[aria-label*="authorized to work" i]',
  ],
  requiresSponsorship: [
    'select[name="requiresSponsorship"]',
    'select[id*="sponsorship"]',
    'select[aria-label*="Sponsorship" i]',
    'select[aria-label*="visa sponsorship" i]',
  ],
  'files.resume': [
    'input[type="file"][name*="resume"]',
    'input[type="file"][aria-label*="Resume" i]',
    'input[type="file"][aria-label*="CV" i]',
    'input[type="file"]',
  ],
  'files.coverLetter': [
    'input[type="file"][name*="coverLetter"]',
    'input[type="file"][name*="cover"]',
    'input[type="file"][aria-label*="Cover letter" i]',
  ],
};

export function resolveLinkedInSelector(
  key: string,
): { element: HTMLElement; selector: string } | null {
  const selectors = LINKEDIN_SELECTORS[key] ?? [];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return { element: el, selector: sel };
  }
  return null;
}
