"use client"

import type React from "react"

import Image from "next/image"
import { useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

export default function MobileChatPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showLoading, setShowLoading] = useState(false)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      console.log("업로드된 파일:", file.name)
    }
  }

  const triggerFileUpload = () => {
    document.getElementById("file-input")?.click()
  }

  const openPopup = () => {
    setShowPopup(true)
    setCurrentPage(0)
  }

  const closePopup = () => {
    setShowPopup(false)
  }

  const nextPage = () => {
    if (currentPage < 2) {
      setCurrentPage(currentPage + 1)
    }
  }

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }

  // 공유 기능
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "단톡방 해부 결과",
          text: "우리 단톡방 분석 결과를 확인해보세요!",
          url: window.location.href,
        })
      } catch (error) {
        console.log("공유 취소됨")
      }
    } else {
      // Web Share API를 지원하지 않는 경우 URL 복사
      try {
        await navigator.clipboard.writeText(window.location.href)
        alert("링크가 복사되었습니다!")
      } catch (error) {
        console.log("복사 실패")
      }
    }
  }

  // 파일명이 20자 이상이면 줄바꿈 처리
  const formatFileName = (fileName: string) => {
    if (fileName.length > 20) {
      const midPoint = Math.floor(fileName.length / 2)
      return fileName.slice(0, midPoint) + "\n" + fileName.slice(midPoint)
    }
    return fileName
  }

  const PopupContent = () => {
    switch (currentPage) {
      case 0:
        return (
          <div className="relative w-full h-full flex items-end justify-center bg-white">
            <Image
              src="/images/how1.png"
              alt="카카오톡 사용법 1단계"
              width={400}
              height={800}
              className="object-contain max-w-full max-h-full"
            />
          </div>
        )
      case 1:
        return (
          <div className="relative w-full h-full flex items-end justify-center bg-white">
            <Image
              src="/images/how2.png"
              alt="카카오톡 사용법 2단계"
              width={400}
              height={800}
              className="object-contain max-w-full max-h-full"
            />
          </div>
        )
      case 2:
        return (
          <div className="relative w-full h-full flex items-end justify-center bg-white">
            <Image
              src="/images/how3.png"
              alt="카카오톡 사용법 3단계"
              width={400}
              height={800}
              className="object-contain max-w-full max-h-full"
            />
          </div>
        )
      default:
        return null
    }
  }

  const startAnalysis = () => {
    setShowLoading(true)
    // 10초 후에 분석 페이지로 이동
    setTimeout(() => {
      setShowLoading(false)
      setShowAnalysis(true)
    }, 10000)
  }

  // 캐릭터 분석 데이터
  const characterAnalysis = [
    {
      name: "주형우",
      character: "아이언맨",
      characterImage: "/images/1.png",
      description:
        '말재간+상황 판단+유머+리더십 = 형우\n"경관용사단 파면합니다", "계엄", "와파 용사단" 등 말장난 천재.',
    },
    {
      name: "이재현",
      character: "곰돌이 푸",
      characterImage: "/images/2.png",
      description:
        '늘 웃지만 자기 할 말은 꼭 하고, 드림력 만렙.\n"뽀지직쫑", "꾸꾸 차 꾸꾸러 꾸" 같은 의성어 장인\n→ "영동하고 따뜻한 드림리푸"',
    },
    {
      name: "김민수",
      character: "스파이더맨",
      characterImage: "/images/3.png",
      description:
        '조용하지만 핵심을 찌르는 한마디의 달인.\n"그거 맞네", "인정" 같은 짧고 굵은 반응으로\n대화의 분위기를 정리하는 능력자',
    },
    {
      name: "박지훈",
      character: "토르",
      characterImage: "/images/4.png",
      description:
        '에너지 넘치는 분위기 메이커, 항상 긍정적.\n"ㅋㅋㅋㅋㅋ", "대박", "미쳤다" 등으로\n톡방에 활력을 불어넣는 비타민 같은 존재',
    },
  ]

  // 로딩 페이지가 표시되면 로딩 페이지 렌더링
  if (showLoading) {
    return (
      <div className="min-h-screen bg-white max-w-md mx-auto flex flex-col items-center justify-center">
        {/* 로딩맨 이미지 - 회전 애니메이션, 크기 증가 */}
        <div className="mb-8">
          <div
            className="animate-spin"
            style={{
              animationDuration: "4s",
            }}
          >
            <Image src="/images/loadingman.png" alt="분석 중" width={250} height={375} className="object-contain" />
          </div>
        </div>

        {/* 분석중 텍스트 - 크기 감소 */}
        <div>
          <Image src="/images/loading.png" alt="분석중..." width={150} height={45} className="object-contain" />
        </div>
      </div>
    )
  }

  // 분석 페이지가 표시되면 분석 페이지 렌더링
  if (showAnalysis) {
    return (
      <div className="min-h-screen bg-white max-w-md mx-auto">
        {/* 상단 oneword.png - 화면 가득 채움 */}
        <div className="w-full">
          <Image
            src="/images/oneword.png"
            alt="이 톡방은 한 마디로"
            width={400}
            height={60}
            className="object-contain w-full"
          />
        </div>

        {/* onewordman.png - oneword 바로 아래, 화면 가득 채움 */}
        <div className="relative w-full px-0">
          <Image
            src="/images/onewordman.png"
            alt="분석 결과 배경"
            width={400}
            height={400}
            className="object-contain w-full"
          />

          {/* 중앙 강조 텍스트 - onewordman의 1사분면(오른쪽 위) */}
          <div className="absolute top-[25%] right-[15%] z-10">
            <div
              className="text-xl font-bold text-black text-center mr-[18px] mt-[-23px]"
              style={{ fontFamily: "ChosunGu, sans-serif" }}
            >
              배고픔이 부른
              <br />
              우정의 연대기
            </div>
          </div>

          {/* 설명 텍스트 - 한마디 정리 바로 아래, onewordman 위에 오버레이 */}
          <div className="absolute top-[50%] left-1/2 transform -translate-x-1/2 w-1/2 z-10">
            <div className="p-4">
              <p
                className="leading-relaxed mr-[-98px] mt-2 mb-[7px] leading-5 text-base font-semibold ml-[43px]"
                style={{ fontFamily: "Pretendard-Regular, sans-serif", color: "#333333" }}
              >
                수많은 식사 약속과 메뉴 선정, 고기냐 돈까스냐로 이어지는 진지한 논의들, 그리고 어디서 밥 먹을지 정하는
                데 온 에너지를 쏟는 모습까지... 이 대화방은 진심으로 밥을 함께 먹는 게 중심인 우정의 기록이야.
              </p>
            </div>
          </div>
        </div>

        {/* character.png - 좌우 가득 채움 */}
        <div className="w-full mt-[125px]">
          <Image
            src="/images/character.png"
            alt="너네가 캐릭터라면"
            width={400}
            height={80}
            className="object-contain w-full"
          />
        </div>

        {/* 캐릭터 분석 섹션 */}
        <div className="px-4 py-6 space-y-8">
          {characterAnalysis.map((person, index) => (
            <div key={index} className="bg-white p-6">
              {/* 이름 - 바탕 폰트로 변경 */}
              <h3 className="text-2xl font-bold text-black mb-4" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
                {person.name}
              </h3>

              {/* 캐릭터 이미지와 말풍선 */}
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-1">
                  {/* 말풍선 - bubble.png 이미지 사용 */}
                  <div className="relative mb-4">
                    <Image
                      src="/images/bubble.png"
                      alt="말풍선"
                      width={200}
                      height={120}
                      className="object-contain w-full max-w-[200px]"
                    />
                    {/* 캐릭터 이름을 말풍선 중앙에 오버레이 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p
                        className="text-black text-center px-4 mr-[30px] font-extrabold text-xl mt-[-9px]"
                        style={{ fontFamily: "ChosunGu, sans-serif" }}
                      >
                        {person.character}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 캐릭터 이미지 - 세로로 더 늘리고 좌우로 꽉 채움 */}
                <div className="w-32 h-52 flex-shrink-0">
                  <Image
                    src={person.characterImage || "/placeholder.svg"}
                    alt={person.character}
                    width={128}
                    height={208}
                    className="object-cover w-full h-full rounded-lg"
                  />
                </div>
              </div>

              {/* 설명 - 좌우로 꽉 채움 */}
              <div className="mt-4">
                <p
                  className="leading-relaxed whitespace-pre-line leading-4 text-base font-semibold mt-0"
                  style={{ fontFamily: "Pretendard-Regular, sans-serif", color: "#333333" }}
                >
                  {person.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* award.png - 좌우 꽉차게 */}
        <div className="w-full mt-6">
          <Image
            src="/images/award.png"
            alt="단톡방 시상식"
            width={400}
            height={60}
            className="object-contain w-full"
          />
        </div>

        {/* 시상식 섹션 */}
        <div className="px-4 py-6">
          {/* 주제 */}
          <div className="w-full mb-6">
            <h2
              className="font-bold text-black leading-relaxed px-2 text-left text-xl"
              style={{ fontFamily: "ChosunGu, sans-serif" }}
            >
              주제: 연인과 싸웠을 때, 제일 먼저 울 것 같은 사람 순위
            </h2>
          </div>

          {/* 시상 내용 */}
          <div className="space-y-6">
            {/* 1위 - 좌우 분할 레이아웃으로 변경 */}
            <div className="bg-white">
              <div className="flex items-start gap-4">
                {/* 왼쪽 절반 - 텍스트 */}
                <div className="w-1/2">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-2xl font-bold text-black" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
                      1위
                    </span>
                    <span className="text-xl font-bold text-black" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
                      -
                    </span>
                    <span
                      className="text-2xl font-bold bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 bg-clip-text text-transparent"
                      style={{ fontFamily: "BookkMyungjo-Bd, serif" }}
                    >
                      곽규민
                    </span>
                  </div>
                  <p
                    className="text-base font-semibold leading-relaxed"
                    style={{ fontFamily: "Pretendard-Regular, sans-serif", color: "#333333" }}
                  >
                    감정 표현이 솔직하고 직접적이라 속상한 마음을 숨기지 못할 것 같음
                  </p>
                </div>

                {/* 오른쪽 절반 - firstplace.png 이미지 */}
                <div className="w-1/2">
                  <Image
                    src="/images/firstplace.png"
                    alt="1위는 이 사람"
                    width={150}
                    height={150}
                    className="object-contain w-full"
                  />
                </div>
              </div>
            </div>

            {/* 2위 */}
            <div className="bg-white">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-2xl font-bold text-black" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
                  2위
                </span>
                <span className="text-xl font-bold text-black" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
                  -
                </span>
                <span
                  className="text-2xl font-bold bg-gradient-to-r from-gray-400 via-gray-500 to-gray-600 bg-clip-text text-transparent"
                  style={{ fontFamily: "BookkMyungjo-Bd, serif" }}
                >
                  이재현
                </span>
              </div>
              <p
                className="text-base font-semibold leading-relaxed"
                style={{ fontFamily: "Pretendard-Regular, sans-serif", color: "#333333" }}
              >
                평소 밝은 모습과 달리 속으로 많이 생각하는 타입이라 감정이 복받칠 것 같음
              </p>
            </div>

            {/* 3위 */}
            <div className="bg-white">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-2xl font-bold text-black" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
                  3위
                </span>
                <span className="text-xl font-bold text-black" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
                  -
                </span>
                <span
                  className="text-2xl font-bold bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 bg-clip-text text-transparent"
                  style={{ fontFamily: "BookkMyungjo-Bd, serif" }}
                >
                  주형우
                </span>
              </div>
              <p
                className="text-base font-semibold leading-relaxed"
                style={{ fontFamily: "Pretendard-Regular, sans-serif", color: "#333333" }}
              >
                리더십이 강해 보이지만 사실 마음이 여린 편이라 예상외로 울 수도 있을 것 같음
              </p>
            </div>
          </div>
        </div>

        {/* 공유 섹션 */}
        <div className="px-4 py-6">
          <div className="flex items-center w-full">
            {/* 왼쪽 절반 - peoga.png */}
            <div className="w-1/2">
              <Image
                src="/images/peoga.png"
                alt="퍼가요 댓글들"
                width={200}
                height={120}
                className="object-contain w-full"
              />
            </div>

            {/* 오른쪽 절반 - 공유 버튼 */}
            <div className="w-1/2">
              <button
                onClick={handleShare}
                className="hover:opacity-80 hover:scale-105 active:scale-95 transition-all duration-200 ease-in-out w-full animate-pulse"
                style={{
                  animation: "pulse 2s infinite",
                }}
              >
                <Image
                  src="/images/share.png"
                  alt="사람이라면 퍼가"
                  width={200}
                  height={120}
                  className="object-contain w-full"
                />
              </button>
            </div>
          </div>

          {/* 안내문 */}
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500" style={{ fontFamily: "BookkMyungjo-Bd, serif" }}>
              ※ 결과페이지는 24시간 동안 공유 가능합니다.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 max-w-md mx-auto">
      {/* 상단 타이틀 영역 */}
      <div className="relative mb-2">
        {/* 3p 배경 이미지 */}
        <div className="absolute top-0 right-0 z-0 px-0 mb-0 ml-0 mr-[-12px] mt-[-26px]">
          <Image
            src="/images/3p.png"
            alt="3명의 사람 실루엣"
            width={280}
            height={200}
            className="object-contain opacity-90"
          />
        </div>

        {/* 타이틀 텍스트 */}
        <div className="relative z-10">
          <h1
            className="text-4xl font-bold leading-tight text-black mt-[15px]"
            style={{ fontFamily: '맑은고딕, "Malgun Gothic", sans-serif' }}
          >
            단톡방 해<br />
            부해드립
            <br />
            니다.
          </h1>
        </div>
      </div>

      {/* 설명 문장 영역 */}
      <div className="mb-4 relative z-10">
        <div
          className="text-sm leading-normal space-y-1 leading-7 tracking-normal my-0 mt-[50px]"
          style={{ fontFamily: "ChosunGu, sans-serif", color: "#333333" }}
        >
          <p className="italic text-base leading-5 font-semibold">√ 친구들과의 대화가 너무 재밌으신 분</p>
          <p className="italic text-base leading-5 font-semibold">√ 그 대화가 잊혀지는 것이 아쉬우신 분</p>
          <p className="italic text-base leading-5 font-semibold">√ 색다른 도파민이 필요하신 분</p>
          <p className="italic text-base leading-5 font-semibold">√ MZ??세대가 되고싶은 분</p>
        </div>
      </div>

      {/* 업로드 영역 */}
      <div className="mb-6 relative">
        <div className="flex justify-center cursor-pointer" onClick={triggerFileUpload}>
          <Image
            src={selectedFile ? "/images/uploaded.png" : "/images/upload.png"}
            alt={selectedFile ? "파일 업로드 완료" : "텍스트 파일 업로드"}
            width={360}
            height={180}
            className="object-contain w-full"
          />
        </div>
        {/* 업로드된 파일명 표시 */}
        {selectedFile && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="text-black font-medium text-sm mt-[-20px] text-center whitespace-pre-line"
              style={{ fontFamily: "ChosunGu, sans-serif" }}
            >
              {formatFileName(selectedFile.name)}
            </div>
          </div>
        )}
        {/* 숨겨진 파일 input */}
        <input id="file-input" type="file" onChange={handleFileUpload} className="hidden" />
        {/* "어떻게 하나요?" / "START" 버튼 */}
        <div className="absolute -bottom-6 left-4">
          {selectedFile ? (
            <button
              onClick={startAnalysis}
              className="hover:opacity-80 hover:scale-105 active:scale-95 transition-all duration-200 ease-in-out transform animate-pulse bg-transparent"
              style={{
                animation: "pulse 2s infinite",
              }}
            >
              <Image src="/images/start(1).png" alt="시작하기" width={160} height={40} className="object-contain" />
            </button>
          ) : (
            <button
              onClick={openPopup}
              className="hover:opacity-80 hover:scale-105 active:scale-95 transition-all duration-200 ease-in-out transform animate-pulse"
              style={{
                animation: "pulse 2s infinite",
              }}
            >
              <Image src="/images/how.png" alt="어떻게 하나요?" width={140} height={35} className="object-contain" />
            </button>
          )}
        </div>
      </div>

      {/* 하단 로봇 영역 */}
      <div className="w-full">
        <Image src="/images/robot.png" alt="로봇 캐릭터" width={400} height={300} className="w-full object-contain" />
      </div>

      {/* 팝업 모달 */}
      {showPopup && (
        <div className="fixed inset-0 bg-white z-50">
          <div className="w-full h-full max-w-md mx-auto relative overflow-hidden">
            {/* 닫기 버튼 - 더 확실히 보이도록 개선 */}
            <button
              onClick={closePopup}
              className="absolute top-4 right-4 z-20 p-3 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <X size={24} className="text-black" />
            </button>

            {/* 팝업 내용 */}
            <div className="h-full">
              <PopupContent />
            </div>

            {/* 네비게이션 버튼들 */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-between px-4">
              <button
                onClick={prevPage}
                disabled={currentPage === 0}
                className={`p-2 rounded-full ${
                  currentPage === 0 ? "text-gray-300 cursor-not-allowed" : "text-gray-600 hover:bg-gray-100"
                } transition-colors`}
              >
                <ChevronLeft size={24} />
              </button>

              {/* 페이지 인디케이터 */}
              <div className="flex space-x-2 items-center">
                {[0, 1, 2].map((page) => (
                  <div
                    key={page}
                    className={`w-2 h-2 rounded-full ${currentPage === page ? "bg-blue-500" : "bg-gray-300"}`}
                  />
                ))}
              </div>

              <button
                onClick={nextPage}
                disabled={currentPage === 2}
                className={`p-2 rounded-full ${
                  currentPage === 2 ? "text-gray-300 cursor-not-allowed" : "text-gray-600 hover:bg-gray-100"
                } transition-colors`}
              >
                <ChevronRight size={24} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  )
}
