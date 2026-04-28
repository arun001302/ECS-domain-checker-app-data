import os
import ssl
import socket
import time
import requests
import dns.resolver
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
from OpenSSL import crypto

app = Flask(__name__)
CORS(app)

# ── Health Check ────────────────────────────────────────────────────────────
# ECS will call this endpoint to determine if the container is healthy.
# If this returns non-200, ECS marks the task as unhealthy and replaces it.
# This is equivalent to the livenessProbe in Kubernetes.
@app.route("/health")
def health():
    return jsonify({"status": "healthy", "service": "domain-checker-api"}), 200


# ── DNS Check ───────────────────────────────────────────────────────────────
def check_dns(domain):
    try:
        resolver = dns.resolver.Resolver()
        resolver.lifetime = 5  # 5 second timeout
        answers = resolver.resolve(domain, "A")
        ip_addresses = [str(r) for r in answers]
        return {
            "status": "resolved",
            "ip_addresses": ip_addresses,
            "record_count": len(ip_addresses)
        }
    except dns.resolver.NXDOMAIN:
        return {"status": "not_found", "ip_addresses": [], "record_count": 0}
    except dns.resolver.NoAnswer:
        return {"status": "no_a_record", "ip_addresses": [], "record_count": 0}
    except dns.exception.Timeout:
        return {"status": "timeout", "ip_addresses": [], "record_count": 0}
    except Exception as e:
        return {"status": "error", "error": str(e), "ip_addresses": [], "record_count": 0}


# ── SSL Certificate Check ────────────────────────────────────────────────────
def check_ssl(domain):
    try:
        # Open a raw SSL connection and pull the certificate
        conn = ssl.create_default_context()
        with socket.create_connection((domain, 443), timeout=5) as sock:
            with conn.wrap_socket(sock, server_hostname=domain) as ssock:
                der_cert = ssock.getpeercert(binary_form=True)
                cert = crypto.load_certificate(crypto.FILETYPE_ASN1, der_cert)

                # Parse expiry date from the cert (format: YYYYMMDDHHMMSSZ)
                expiry_raw = cert.get_notAfter().decode("utf-8")
                expiry_date = datetime.strptime(expiry_raw, "%Y%m%d%H%M%SZ")
                days_remaining = (expiry_date - datetime.utcnow()).days

                issuer = cert.get_issuer()
                issuer_name = issuer.O or issuer.CN or "Unknown"

                return {
                    "valid": True,
                    "expiry_date": expiry_date.strftime("%Y-%m-%d"),
                    "days_remaining": days_remaining,
                    "issuer": issuer_name,
                    "expired": days_remaining < 0
                }
    except ssl.SSLCertVerificationError:
        return {"valid": False, "error": "Certificate verification failed", "expired": False}
    except ConnectionRefusedError:
        return {"valid": False, "error": "Port 443 not open", "expired": False}
    except socket.timeout:
        return {"valid": False, "error": "Connection timed out", "expired": False}
    except Exception as e:
        return {"valid": False, "error": str(e), "expired": False}


# ── HTTP/HTTPS Reachability Check ────────────────────────────────────────────
def check_http(domain):
    results = {}

    for scheme in ["https", "http"]:
        url = f"{scheme}://{domain}"
        try:
            start = time.time()
            response = requests.get(
                url,
                timeout=8,
                allow_redirects=True,
                headers={"User-Agent": "DomainHealthChecker/1.0"}
            )
            latency_ms = round((time.time() - start) * 1000)

            results[scheme] = {
                "reachable": True,
                "status_code": response.status_code,
                "latency_ms": latency_ms,
                "final_url": response.url,  # captures redirect destination
                "redirected": response.url != url
            }
        except requests.exceptions.SSLError:
            results[scheme] = {"reachable": False, "error": "SSL error"}
        except requests.exceptions.ConnectionError:
            results[scheme] = {"reachable": False, "error": "Connection refused"}
        except requests.exceptions.Timeout:
            results[scheme] = {"reachable": False, "error": "Request timed out"}
        except Exception as e:
            results[scheme] = {"reachable": False, "error": str(e)}

    return results


# ── Main Domain Check Endpoint ───────────────────────────────────────────────
@app.route("/api/check")
def check_domain():
    domain = request.args.get("domain", "").strip().lower()

    # Strip protocol if user accidentally includes it
    domain = domain.replace("https://", "").replace("http://", "").rstrip("/")

    if not domain:
        return jsonify({"error": "No domain provided. Use ?domain=example.com"}), 400

    # Basic validation — must have at least one dot
    if "." not in domain:
        return jsonify({"error": "Invalid domain format"}), 400

    # Run all checks and time the total
    start_time = time.time()

    dns_result = check_dns(domain)
    ssl_result = check_ssl(domain)
    http_result = check_http(domain)

    total_time_ms = round((time.time() - start_time) * 1000)

    # Determine overall health status
    is_healthy = (
        dns_result["status"] == "resolved" and
        http_result.get("https", {}).get("reachable", False) and
        ssl_result.get("valid", False)
    )

    return jsonify({
        "domain": domain,
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "overall_status": "healthy" if is_healthy else "degraded",
        "total_check_time_ms": total_time_ms,
        "dns": dns_result,
        "ssl": ssl_result,
        "http": http_result
    }), 200


# ── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # This block only runs locally (python app.py).
    # In the container, gunicorn starts the app directly — not this block.
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)