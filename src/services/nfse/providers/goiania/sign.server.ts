// Assinatura XML-DSig (RSA-SHA1, enveloped) com certificado digital A1 (PFX/P12).
// Uso exclusivo no servidor — a senha e a chave privada nunca saem daqui.
import forge from "node-forge";

type Chaves = { privateKey: forge.pki.rsa.PrivateKey; certPem: string };

function abrirPfx(base64: string, senha: string): Chaves {
  const der = forge.util.decode64(base64.replace(/\s+/g, ""));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);

  let privateKey: forge.pki.rsa.PrivateKey | null = null;
  let cert: forge.pki.Certificate | null = null;
  for (const safe of p12.safeContents) {
    for (const bag of safe.safeBags) {
      if (!privateKey && bag.key) privateKey = bag.key as forge.pki.rsa.PrivateKey;
      if (!cert && bag.cert) cert = bag.cert;
    }
  }
  if (!privateKey || !cert) throw new Error("Certificado digital inválido ou senha incorreta.");
  if (cert.validity.notAfter.getTime() < Date.now())
    throw new Error("O certificado digital está vencido.");
  return { privateKey, certPem: forge.pki.certificateToPem(cert) };
}

function certBase64(certPem: string) {
  return certPem
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

function sha1Base64(texto: string) {
  const md = forge.md.sha1.create();
  md.update(texto, "utf8");
  return forge.util.encode64(md.digest().getBytes());
}

/** Assina o elemento com o Id informado e devolve o XML com a tag <Signature>. */
export function assinarXml(
  xml: string,
  elementoId: string,
  pfxBase64: string,
  senha: string,
): string {
  const { privateKey, certPem } = abrirPfx(pfxBase64, senha);

  const abre = xml.indexOf(`Id="${elementoId}"`);
  if (abre < 0) throw new Error("Não foi possível localizar o trecho a assinar no XML.");
  const inicio = xml.lastIndexOf("<", abre);
  const nomeTag = xml.slice(inicio + 1).split(/[\s>]/)[0]!;
  const fim = xml.indexOf(`</${nomeTag}>`, abre) + `</${nomeTag}>`.length;
  const elemento = xml.slice(inicio, fim);

  const digest = sha1Base64(elemento);
  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="#${elementoId}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(signedInfo, "utf8");
  const assinatura = forge.util.encode64(privateKey.sign(md));

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${assinatura}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certBase64(certPem)}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  return xml.slice(0, fim) + signature + xml.slice(fim);
}

/** Lê o certificado só para informar validade e titular (nunca devolve a chave). */
export function inspecionarCertificado(pfxBase64: string, senha: string) {
  const { certPem } = abrirPfx(pfxBase64, senha);
  const cert = forge.pki.certificateFromPem(certPem);
  const cn = cert.subject.getField("CN")?.value ?? "";
  return { titular: String(cn), validoAte: cert.validity.notAfter.toISOString() };
}
