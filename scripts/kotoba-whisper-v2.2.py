import argparse
import os
from pathlib import Path


def format_timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def punctuate(text: str, punctuator) -> str:
    text = text.strip()
    if not text or any(mark in text for mark in ("!", "?", "、", "。")):
        return text
    if punctuator is None:
        return text
    result = "".join(punctuator.infer([text])[0])
    return text if "unk" in result.lower() else result


def write_vtt(output_path: Path, chunks: list[dict], punctuator) -> None:
    cues = ["WEBVTT", ""]
    for chunk in chunks:
        timestamp = chunk.get("timestamp") or ()
        if len(timestamp) != 2 or timestamp[0] is None or timestamp[1] is None:
            continue
        text = punctuate(str(chunk.get("text", "")), punctuator)
        if not text:
            continue
        cues.extend([
            f"{format_timestamp(float(timestamp[0]))} --> {format_timestamp(float(timestamp[1]))}",
            text,
            "",
        ])
    output_path.write_text("\n".join(cues), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio")
    parser.add_argument("--output")
    parser.add_argument("--model", default="kotoba-tech/kotoba-whisper-v2.2")
    parser.add_argument("--cache-dir", required=True)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir).resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(cache_dir))

    print("progress = 1%", flush=True)
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    model_kwargs = {"attn_implementation": "sdpa"} if torch.cuda.is_available() else {}
    processor = AutoProcessor.from_pretrained(args.model, cache_dir=cache_dir)
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        args.model,
        cache_dir=cache_dir,
        low_cpu_mem_usage=True,
        dtype=torch_dtype,
        use_safetensors=True,
        **model_kwargs,
    ).to(device)
    print("progress = 10%", flush=True)

    punctuator = None
    try:
        from punctuators.models import PunctCapSegModelONNX
        punctuator = PunctCapSegModelONNX.from_pretrained(
            "1-800-BAD-CODE/xlm-roberta_punctuation_fullstop_truecase"
        )
    except Exception as error:
        print(f"punctuator unavailable: {error}", flush=True)

    if args.prepare_only:
        print(f"Kotoba-Whisper v2.2 ready on {device}", flush=True)
        return
    if not args.audio or not args.output:
        parser.error("--audio and --output are required unless --prepare-only is used")

    transcriber = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        dtype=torch_dtype,
        device=device,
        batch_size=8,
    )
    result = transcriber(
        args.audio,
        chunk_length_s=30,
        stride_length_s=(5, 5),
        return_timestamps=True,
        ignore_warning=True,
        generate_kwargs={"language": "ja", "task": "transcribe"},
    )
    print("progress = 95%", flush=True)
    write_vtt(Path(args.output), result.get("chunks", []), punctuator)
    print("progress = 100%", flush=True)


if __name__ == "__main__":
    main()
