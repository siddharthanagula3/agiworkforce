'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Mail, MapPin, MessageSquare, Send, Share2, Camera } from 'lucide-react';
import { Header } from '../../components/layout/Header';

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Create mailto link as fallback
    const mailtoLink = `mailto:contact@agiworkforce.com?subject=${encodeURIComponent(formState.subject)}&body=${encodeURIComponent(`Name: ${formState.name}\nEmail: ${formState.email}\n\n${formState.message}`)}`;
    window.location.href = mailtoLink;

    setIsSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />

      <main className="flex-1 pt-24">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 md:py-24">
          <div className="absolute inset-0 bg-black" />
          <div className="container relative mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              Get in Touch
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
              Have questions about AGI Workforce? We&apos;re here to help. Reach out and we&apos;ll
              get back to you as soon as possible.
            </p>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-16 bg-zinc-950">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-16 max-w-6xl mx-auto">
              {/* Contact Info */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-bold mb-6">Contact Information</h2>
                  <p className="text-zinc-400 mb-8">
                    Whether you have a question about features, pricing, or anything else, I&apos;m
                    ready to answer all your questions.
                  </p>
                </div>

                <div className="space-y-6">
                  <a
                    href="mailto:contact@agiworkforce.com"
                    className="flex items-start gap-4 p-4 rounded-xl border border-zinc-800 bg-black/50 hover:border-[#c8892a]/50 transition-colors"
                  >
                    <div className="p-3 rounded-lg bg-[#c8892a]/10">
                      <Mail className="h-6 w-6 text-[#c8892a]" />
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Email Us</div>
                      <div className="text-zinc-400">contact@agiworkforce.com</div>
                    </div>
                  </a>

                  <div className="flex items-start gap-4 p-4 rounded-xl border border-zinc-800 bg-black/50">
                    <div className="p-3 rounded-lg bg-[#c8892a]/10">
                      <MapPin className="h-6 w-6 text-[#c8892a]" />
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Location</div>
                      <div className="text-zinc-400">Austin, TX, United States</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl border border-zinc-800 bg-black/50">
                    <div className="p-3 rounded-lg bg-[#c8892a]/10">
                      <MessageSquare className="h-6 w-6 text-[#c8892a]" />
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Response Time</div>
                      <div className="text-zinc-400">
                        24 hours - 1 week (solo founder, responses may take time)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Social Links */}
                <div className="pt-6 border-t border-zinc-800">
                  <div className="text-sm text-zinc-500 mb-4">Follow Us</div>
                  <div className="flex gap-4">
                    <a
                      href="https://www.linkedin.com/company/agi-automation-llc"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-lg border border-zinc-800 bg-black/50 hover:border-[#c8892a]/50 hover:text-[#c8892a] transition-colors"
                    >
                      <Share2 className="h-5 w-5" />
                    </a>
                    <a
                      href="https://www.instagram.com/agiworkforce"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-lg border border-zinc-800 bg-black/50 hover:border-[#c8892a]/50 hover:text-[#c8892a] transition-colors"
                    >
                      <Camera className="h-5 w-5" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Contact Form */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
                {submitted ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 mx-auto mb-6 flex items-center justify-center">
                      <Send className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Message Sent!</h3>
                    <p className="text-zinc-400 mb-6">
                      Your email client should have opened. If not, please email us directly at
                      contact@agiworkforce.com
                    </p>
                    <button
                      onClick={() => setSubmitted(false)}
                      className="text-[#c8892a] hover:text-[#d4993a]"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <h3 className="text-xl font-semibold mb-6">Send us a Message</h3>

                    <div>
                      <label htmlFor="name" className="block text-sm font-medium mb-2">
                        Your Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        required
                        value={formState.name}
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        className="w-full px-4 py-3 rounded-lg bg-black border border-zinc-800 focus:border-[#c8892a] focus:outline-none focus:ring-1 focus:ring-[#c8892a]/50 transition-colors"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        required
                        value={formState.email}
                        onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                        className="w-full px-4 py-3 rounded-lg bg-black border border-zinc-800 focus:border-[#c8892a] focus:outline-none focus:ring-1 focus:ring-[#c8892a]/50 transition-colors"
                        placeholder="john@example.com"
                      />
                    </div>

                    <div>
                      <label htmlFor="subject" className="block text-sm font-medium mb-2">
                        Subject
                      </label>
                      <select
                        id="subject"
                        required
                        value={formState.subject}
                        onChange={(e) => setFormState({ ...formState, subject: e.target.value })}
                        className="w-full px-4 py-3 rounded-lg bg-black border border-zinc-800 focus:border-[#c8892a] focus:outline-none focus:ring-1 focus:ring-[#c8892a]/50 transition-colors"
                      >
                        <option value="">Select a topic</option>
                        <option value="General Inquiry">General Inquiry</option>
                        <option value="Technical Support">Technical Support</option>
                        <option value="Billing Question">Billing Question</option>
                        <option value="Feature Request">Feature Request</option>
                        <option value="Partnership">Partnership Opportunity</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-medium mb-2">
                        Message
                      </label>
                      <textarea
                        id="message"
                        required
                        rows={5}
                        value={formState.message}
                        onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                        className="w-full px-4 py-3 rounded-lg bg-black border border-zinc-800 focus:border-[#c8892a] focus:outline-none focus:ring-1 focus:ring-[#c8892a]/50 transition-colors resize-none"
                        placeholder="How can we help you?"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 px-6 rounded-md bg-[#c8892a] hover:bg-[#d4993a] text-[#09090b] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        'Sending...'
                      ) : (
                        <>
                          Send Message
                          <Send className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ CTA */}
        <section className="py-16 bg-black">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold mb-4">Looking for Quick Answers?</h2>
            <p className="text-zinc-400 mb-6">
              Check out our FAQ page for answers to common questions.
            </p>
            <Link
              href="/faq"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-8 text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              View FAQ
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold">
            <Bot className="h-5 w-5 text-zinc-500" />
            <span className="text-zinc-500">AGI Workforce</span>
          </div>
          <div className="text-sm text-zinc-600">
            &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
