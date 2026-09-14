# 외부 HTTPS 요청: DNS, TCP, TLS, Reverse Proxy

## 1. 학습 목적

로컬 Fastify 서버에는 `http://127.0.0.1:3001`로 직접 접속했기
때문에 DNS, TLS, Reverse Proxy가 없었다. 외부 HTTPS 주소인
`https://example.com/`을 조회하여 운영 환경에서 추가되는 흐름을
확인했다.

```text
URL 해석
↓
DNS
↓
TCP Connection
↓
TLS Handshake
↓
암호화된 HTTP Request
↓
Reverse Proxy
↓
Application Server
↓
HTTP Response
```

## 2. 실행한 명령

DNS A record를 조회했다.

```bash
dig example.com A
```

그런 다음 HTTP/1.1을 명시하여 HTTPS 연결 과정을 출력했다.

```bash
curl -v --http1.1 https://example.com/ -o /dev/null
```

각 option의 의미는 다음과 같다.

```text
-v
→ DNS, connection, TLS, HTTP Header 등의 verbose 정보 출력

--http1.1
→ HTTP/1.1을 사용하도록 제한

-o /dev/null
→ Response Body는 수신하되 파일이나 화면에 보관하지 않고 버림
```

`-o /dev/null`이 Body 요청 자체를 취소하는 것은 아니다. curl은 Body를
받고 HTTP framing을 처리한 뒤 결과를 버린다.

## 3. `dig`로 DNS 조회

실제 응답의 핵심 부분은 다음과 같았다.

```text
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 11479
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; QUESTION SECTION:
;example.com.            IN  A

;; ANSWER SECTION:
example.com.     284     IN  A   104.20.23.154
example.com.     284     IN  A   172.66.147.243

;; Query time: 7 msec
;; SERVER: 2001:270::3:1#53(2001:270::3:1)
;; MSG SIZE  rcvd: 72
```

### 질문의 의미

```text
example.com.
→ 조회할 DNS name

IN
→ Internet class

A
→ IPv4 주소를 나타내는 record type
```

`example.com.`의 마지막 `.`은 DNS root까지 포함한 절대 도메인
이름임을 나탄낸다. 평소 URL에서는 이 마지막 점을 생략한다.

### DNS 응답

```text
status: NOERROR
→ DNS 요청을 오류 없이 처리

ANSWER: 2
→ A record 두 개를 반환
```

`NOERROR`는 요청 처리가 성공했다는 뜻이지 항상 Answer가 있다는
뜻은 아니다. 이번 응답은 `ANSWER: 2`이므로 실제 IPv4 주소 두
개가 있었다.

```text
104.20.23.154
172.66.147.243
```

하나의 domain은 부하 분산과 장애 대응 등을 위해 여러 IP를 반환할 수
있다. DNS는 접속 후보 IP를 제공하며 TCP connection을 직접 만들지
않는다.

### TTL

```text
example.com.  284  IN  A  104.20.23.154
              ^
              TTL
```

TTL은 `Time To Live`이고 단위는 초다. DNS resolver가 이 결과를
약 284초 동안 더 cache할 수 있음을 나탄낸다.

TTL이 끝난다고 기존 TCP connection이 끊기거나 해당 server가 사라지는
것은 아니다. cache된 DNS 결과를 다시 확인해야 한다는 뜻이다.

### 응답한 DNS resolver

```text
SERVER: 2001:270::3:1#53
```

```text
2001:270::3:1
→ dig의 질문에 응답한 DNS resolver의 IPv6 주소

53
→ DNS port
```

이 주소는 `example.com` Web server의 IP가 아니다. resolver가 이미
cache한 결과를 사용했는지, root·TLD·authoritative DNS까지 새로
조회했는지는 이 결과만으로 확정할 수 없다.

### DNS flag

```text
qr
→ Query가 아니라 Response임

rd
→ client가 recursion을 원함(Recursion Desired)

ra
→ resolver가 recursion을 제공함(Recursion Available)
```

`Query time: 7 msec`는 `dig`와 DNS resolver 사이의 질문·응답 시간이다.
전체 Web page 로딩 시간이나 TCP·TLS·HTTP 처리 시간이 아니다.

## 4. curl verbose 출력 기호

curl verbose log는 앞의 기호로 데이터의 성격과 방향을 구분한다.

```text
*
→ curl이 제공하는 진단 정보

>
→ curl이 server에 보낸 HTTP Header

<
→ server가 curl에 보낸 HTTP Header

}
→ TLS 과정에서 밖으로 보낸 bytes

{
→ TLS 과정에서 안으로 받은 bytes
```

## 5. DNS 결과에서 TCP connection까지

curl은 IPv6와 IPv4 후보를 모두 확인했다.

```text
* Host example.com:443 was resolved.
* IPv6: 2606:4700:10::ac42:93f3, 2606:4700:10::6814:179a
* IPv4: 172.66.147.243, 104.20.23.154
```

그런 다음 첫 번째 IPv6 주소의 443번 port로 접속했다.

```text
* Trying [2606:4700:10::ac42:93f3]:443...
* Connected to example.com (2606:4700:10::ac42:93f3) port 443
```

```text
목적지 IP
→ 2606:4700:10::ac42:93f3

목적지 port
→ 443
```

443번은 `https` scheme의 기본 port다. curl log는 TCP packet을 하나씩
보여주지는 않지만 `Connected`는 개념적으로 다음 TCP 3-way handshake가
성공했음을 뜻한다.

```text
client → server: SYN
server → client: SYN + ACK
client → server: ACK
```

이 시점에는 암호화된 연결을 만든 것이 아니며 HTTP Request도 아직
보내지 않았다.

## 6. ALPN과 HTTP version 선택

```text
* ALPN: curl offers http/1.1
```

ALPN은 TLS Handshake 과정에서 TLS 위에 어떤 application protocol을
사용할지 협상하는 기능이다. `--http1.1` option을 사용했으므로 curl은
HTTP/1.1을 제안했다.

```text
* ALPN: server accepted http/1.1
```

server가 제안을 받아들였고 이 TLS connection의 application protocol은
HTTP/1.1로 결정됐다.

## 7. TLS 1.3 Handshake

실제 log에서 다음 흐름을 확인했다.

```text
ClientHello
↓
ServerHello
↓
EncryptedExtensions
↓
Certificate
↓
CertificateVerify
↓
Server Finished
↓
Client Finished
```

### ClientHello

```text
* (304) (OUT), TLS handshake, Client hello (1):
```

client가 자신이 지원하는 TLS version, cipher suite, ALPN, SNI,
임시 key share 등을 제안한다. SNI는 HTTP Request를 보내기 전에 server가
요청 domain에 맞는 인증서를 선택하도록 돕는다.

### ServerHello

```text
* (304) (IN), TLS handshake, Server hello (2):
```

server가 TLS version과 cipher suite를 선택하고 자신의 임시 key share를
보낸다. 이 시점의 key agreement 결과로 client와 server는 Handshake
보호에 필요한 key를 파생할 수 있다.

### `Unknown (8)`

```text
* (304) (IN), TLS handshake, Unknown (8):
```

TLS 1.3에서 message type `8`은 `EncryptedExtensions`다. curl이 사용한 TLS
backend의 verbose 표기에서 이름을 붙이지 못해 `Unknown`으로 보였을 뿐
오류가 아니다.

### Certificate와 CertificateVerify

```text
* (304) (IN), TLS handshake, Certificate (11):
* (304) (IN), TLS handshake, CERT verify (15):
```

```text
Certificate
→ server 인증서와 공개키 제공

CertificateVerify
→ server가 해당 공개키와 대응하는 개인키를
  실제로 소유했음을 Handshake 서명으로 증명
```

인증서를 복사하여 제출하는 것만으로는 실제 소유자라는 사실을
증명할 수 없기 때문에 CertificateVerify가 필요하다.

### Finished

```text
* (304) (IN), TLS handshake, Finished (20):
* (304) (OUT), TLS handshake, Finished (20):
```

양쪽이 Handshake transcript와 파생한 key를 기반으로 전체 Handshake가
변조되지 않았고 같은 key material을 계산했음을 검증한다.

### `(304)`는 HTTP 304가 아니다

curl이 TLS version을 알아보기 쉬운 이름으로 표시하지 못한 경우
숫자를 16진수로 표시한다. 여기의 `304`는 `0x0304`, 즉 TLS 1.3을
나타내며 HTTP Status Code `304 Not Modified`가 아니다.

HTTP Status Code라면 다음과 같이 Status Line에 나타난다.

```http
HTTP/1.1 304 Not Modified
```

## 8. 인증서 검증

```text
* CAfile: /etc/ssl/cert.pem
* subject: CN=example.com
* subjectAltName: host "example.com" matched cert's "example.com"
* issuer: C=US; O=SSL Corporation; CN=Cloudflare TLS Issuing ECC CA 3
* SSL certificate verify ok.
```

curl은 신뢰하는 CA 목록을 기준으로 인증서 chain과 서명을 검증하고,
접속한 hostname이 인증서의 `subjectAltName`과 일치하는지, 인증서가
유효한 기간인지를 확인한다.

```text
SSL certificate verify ok.
```

이 결과는 curl이 현재 연결한 server를 `example.com`의 신뢰할 수 있는
TLS server로 검증했다는 뜻이다.

## 9. 양쪽은 어떻게 같은 비밀값을 만드는가

일반적인 TLS 1.3의 최초 연결은 `(EC)DHE` key agreement를 사용한다.
핵심은 비밀키를 보내지 않고 자신의 비밀값과 상대방의 공개값을
조합하는 것이다.

### 작은 숫자로 보는 Diffie–Hellman

다음 공개 숫자는 누구나 알아도 된다.

```text
p = 23
g = 5
```

client는 비밀값 `a = 6`을 선택하고 공개값을 계산한다.

```text
A = 5⁶ mod 23
  = 8
```

server는 비밀값 `b = 15`를 선택하고 공개값을 계산한다.

```text
B = 5¹⁵ mod 23
  = 19
```

양쪽은 `A = 8`과 `B = 19`만 교환하고 `a = 6`과 `b = 15`는 보내지
않는다.

client의 계산:

```text
Bᵃ mod p
= 19⁶ mod 23
= 2
```

server의 계산:

```text
Aᵇ mod p
= 8¹⁵ mod 23
= 2
```

두 결과가 같은 이유는 다음과 같다.

```text
client: (gᵇ)ᵃ = gᵇᵃ
server: (gᵃ)ᵇ = gᵃᵇ

ab = ba
→ gᵇᵃ = gᵃᵇ
```

실제 암호에서는 훨씬 큰 숫자나 타원곡선 연산을 사용하여 공개값에서
원래 비밀값을 역산하는 것이 현실적으로 어렵게 만든다. 위의 작은
숫자 예시는 원리 설명용이며 보안성은 없다.

### 실제 ECDHE의 개념

```text
공개된 타원곡선 기준점: G

client private value: a
client public key share: A = a × G

server private value: b
server public key share: B = b × G
```

```text
client: a × B = a × (b × G) = ab × G
server: b × A = b × (a × G) = ba × G

ab × G = ba × G
```

따라서 양쪽은 private value를 전송하지 않고도 같은 shared secret을
계산한다.

### shared secret에서 TLS key 파생

shared secret을 그대로 application encryption key로 사용하지는 않는다.
TLS 1.3은 shared secret과 Handshake transcript hash를 HKDF에 넣어 여러
key를 파생한다.

```text
ECDHE shared secret
+
Handshake transcript hash
↓
HKDF
↓
Handshake traffic keys
Application traffic keys
IV
Finished verification key
```

“같은 key 하나”보다는 양쪽이 같은 key set을 계산한다고 이해하는
것이 정확하다.

```text
client → server key
→ client가 암호화, server가 복호화

server → client key
→ server가 암호화, client가 복호화
```

### 인증서 key와 임시 key는 다른 key다

```text
ECDHE 임시 key pair
→ shared secret 계산
→ connection마다 새로 생성

인증서 key pair
→ Handshake 서명과 server 신원 증명
→ 상대적으로 오래 유지
```

Diffie–Hellman만으로는 중간자가 양쪽의 공개 key share를 교체할 수 있다.
server가 인증서 개인키로 Handshake transcript에 서명하고 client가
검증함으로써, 현재 key agreement 상대가 실제 `example.com` 인증서의
소유자임을 확인한다.

## 10. TLS 위의 HTTP Request와 Response

TLS Handshake가 끝난 뒤 curl이 HTTP Request를 전송했다.

```http
> GET / HTTP/1.1
> Host: example.com
> User-Agent: curl/8.7.1
> Accept: */*
```

curl log에는 읽을 수 있는 HTTP 문자열로 보이지만 실제 network에서는
TLS record로 암호화되어 전송된다.

```text
curl이 HTTP Request 생성
↓
TLS record layer가 암호화·무결성 보호
↓
TCP connection으로 bytes 전송
```

server는 다음 HTTP Response를 반환했다.

```http
< HTTP/1.1 200 OK
< Content-Type: text/html
< Transfer-Encoding: chunked
< Connection: keep-alive
< Server: cloudflare
```

`Transfer-Encoding: chunked`는 Body 전체 길이를 `Content-Length`로 먼저
알리는 대신 HTTP/1.1 chunk framing을 사용했다는 뜻이다.

```text
chunk size
chunk data
chunk size
chunk data
...
0
```

마지막 zero-size chunk가 Body의 끝을 나탄낸다. 이 HTTP 규칙상의
chunk는 Node.js Stream이 application에 전달하는 임의의 chunk 경계와
구분해야 한다.

## 11. Reverse Proxy

Reverse Proxy는 client 요청을 application server 앞에서 대신 받는 server다.
운영 환경에서 DNS는 종종 Node.js server의 private IP가 아니라 Reverse
Proxy의 public IP를 반환한다.

```text
Browser
│
│ HTTPS :443
▼
Reverse Proxy
│
│ 내부 HTTP 또는 HTTPS
▼
Node.js / Fastify :3001
```

### connection은 보통 두 개다

```text
connection 1
Browser ↔ Reverse Proxy

connection 2
Reverse Proxy ↔ Node.js/Fastify
```

Browser의 TCP connection이 Node.js까지 하나로 관통하는 것이 아니다. Reverse
Proxy가 TLS를 종료하는 일반적인 구성에서는 외부 Request를 복호화하고
Host, Method, Path 등을 확인한 뒤 upstream server에 새 HTTP Request를
보낸다.

Reverse Proxy는 다음 역할을 할 수 있다.

- TLS 인증서와 HTTPS connection 관리
- Domain과 Path에 따른 routing
- 여러 application instance에 load balancing
- Cache와 compression
- Rate limiting과 일부 보안 규칙
- application의 private IP와 port 숨기기

### Cloudflare log에서 확인한 것

```http
Server: cloudflare
```

접속한 IP와 Response Header는 client가 Cloudflare edge와 통신했다는
단서다. 다만 `Server` Header는 server가 작성하는 문자열이므로 그 값
하나만을 암호학적 증명으로 보면 안 된다.

또한 Cloudflare가 cached HTML을 바로 반환했는지, origin server까지
요청을 전달했는지는 client log만으로 확정할 수 없다. cache hit이라면
origin application server는 해당 요청을 받지 않을 수 있다.

## 12. eut-zza 운영 환경을 가정한 전체 흐름

```text
1. Browser가 https://api.eut-zza.com/songs URL을 해석한다.

2. DNS resolver가 api.eut-zza.com의 Reverse Proxy IP를 반환한다.

3. Browser가 해당 IP의 443번 port에 TCP 3-way handshake로
   connection을 만든다.

4. Browser와 Reverse Proxy가 TLS Handshake를 수행한다.

5. Browser가 TLS로 보호된 GET /songs HTTP Request를 보낸다.

6. Reverse Proxy가 Request를 복호화하고 Host·Method·Path를
   확인한다.

7. Reverse Proxy가 별도 connection으로 Fastify:3001에 새 HTTP
   Request를 전달한다.

8. Fastify router가 GET /songs handler를 선택하고 Response를 만든다.

9. Reverse Proxy가 Fastify Response를 받아 기존 Browser와의 TLS
   connection으로 암호화해 전달한다.

10. Browser가 TLS record를 복호화하여 HTTP Response를 복원한다.

11. frontend JavaScript의 cross-origin fetch였다면 Browser가 CORS를
    검사한 뒤 Response를 fetch에 전달한다.

12. response.json()이 JSON Body를 JavaScript object로 변환하고,
    React가 필요하면 상태와 UI를 갱신한다.
```

`https://api.eut-zza.com/songs`는 URL이고 `api.eut-zza.com`이 hostname이다.
client는 `HTTP + JavaScript + CSS`가 아니라 Browser이며, HTTP는 통신
protocol이고 HTML·CSS·JavaScript·JSON은 전송되는 resource 또는 data다.

## 13. 바로잡은 오해

### 오해 1: URL 전체가 domain이다

```text
https://api.eut-zza.com/songs
→ URL

api.eut-zza.com
→ hostname/domain

/songs
→ path
```

### 오해 2: TLS도 3-way handshake다

```text
TCP
→ TCP 3-way handshake

TLS
→ TLS Handshake

TLS 1.3
→ TLS protocol version
```

TLS `1.3`의 `3`은 Handshake 횟수가 아니다.

### 오해 3: 하나의 TCP connection이 Browser에서 Node.js까지 이어진다

Reverse Proxy가 있다면 Browser–Proxy connection과 Proxy–Application
connection은 별개인 경우가 일반적이다.

### 오해 4: 인증서 공개키로 TLS traffic key를 만든다

TLS 1.3의 일반적인 ECDHE 연결에서는 임시 key share로 shared secret을
계산한다. 인증서 key는 현재 key agreement 상대의 신원을 증명하는
서명에 사용된다.

### 오해 5: TLS 복호화가 곧 화면 rendering을 뜻한다

TLS 처리는 HTTP Response bytes를 Browser에 전달하는 단계다. 그 후
처리는 resource type과 요청 방식에 따라 다르다.

```text
Document navigation의 HTML
→ HTML parsing과 Browser rendering

fetch의 JSON Response
→ CORS 검사
→ JavaScript가 response.json() 호출
→ 필요하면 React state와 UI 갱신
```

## 14. 핵심 결론

```text
DNS는 hostname의 접속 후보 IP를 알려주지만 connection은 만들지 않는다.

HTTPS에서는 TCP connection 후 TLS Handshake가 HTTP Request보다 먼저다.

TLS 1.3의 임시 key agreement는 비밀키를 전송하지 않고 shared secret을 만든다.

인증서는 key agreement 상대가 진짜 target server인지 증명한다.

Reverse Proxy 구성에서 client connection과 application connection은 별개다.

TLS 복호화 후에도 HTTP·CORS·JSON parsing·React rendering 등의 처리가 남아 있다.
```

## 참고 자료

- [RFC 1034: Domain Names - Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035: Domain Names - Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 8446: TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [curl manual](https://curl.se/docs/manpage.html)
- [curl TLS Certificate Verification](https://curl.se/docs/sslcerts.html)
- [RFC 9112: HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112)
- [curl의 TLS version verbose 표기 코드](https://github.com/curl/curl/blob/master/lib/vtls/openssl.c#L2297-L2321)
